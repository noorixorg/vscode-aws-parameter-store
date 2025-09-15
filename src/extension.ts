import * as vscode from 'vscode';
import { AwsProfileService } from './awsProfileService';
import { ParameterStoreService } from './parameterStoreService';
import { ParameterTreeProvider, ParameterTreeItem } from './parameterTreeProvider';
import { openParameterEditor } from './parameterEditor';
import { AwsProfile, ParameterStoreItem } from './types';

export function activate(context: vscode.ExtensionContext) {
  console.log('AWS Parameter Store extension is now active');

  // Initialize services
  const profileService = new AwsProfileService();
  const parameterStoreService = new ParameterStoreService();
  const treeProvider = new ParameterTreeProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView('awsParameterStore', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  // Parameter editor is now handled via webview panels

  // State management
  let currentProfile: string | undefined;
  let currentRegion: string | undefined;
  let availableProfiles: AwsProfile[] = [];

  // AWS Regions list
  // List of all AWS regions as of June 2024
  const awsRegions = [
    // US Regions
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    // Africa
    'af-south-1',
    // Asia Pacific
    'ap-east-1', 'ap-south-1', 'ap-south-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3', 'ap-southeast-4',
    'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
    // Canada
    'ca-central-1',
    // China
    'cn-north-1', 'cn-northwest-1',
    // Europe
    'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1', 'eu-south-1', 'eu-south-2',
    // Middle East
    'me-south-1', 'me-central-1',
    // South America
    'sa-east-1',
    // AWS GovCloud (US)
    'us-gov-east-1', 'us-gov-west-1',
    // Israel
    'il-central-1',
    // UAE
    'me-central-1'
  ];

  // Initialize extension
  async function initialize() {
    try {
      // Load AWS profiles
      availableProfiles = await profileService.loadProfiles();
      
      if (availableProfiles.length === 0) {
        vscode.window.showWarningMessage(
          'No AWS profiles found. Please configure AWS credentials in ~/.aws/credentials',
          'Open AWS Docs'
        ).then(selection => {
          if (selection === 'Open AWS Docs') {
            vscode.env.openExternal(vscode.Uri.parse('https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html'));
          }
        });
        return;
      }

      // Set default profile and region
      const config = vscode.workspace.getConfiguration('awsParameterStore');
      const defaultProfileName = config.get<string>('defaultProfile') || 'default';
      const defaultRegion = config.get<string>('defaultRegion') || 'us-east-1';

      const defaultProfile = profileService.getProfile(defaultProfileName) || availableProfiles[0];
      currentProfile = defaultProfile.name;
      currentRegion = profileService.getRegionForProfile(currentProfile) || defaultRegion;

      // Update tree view context
      treeProvider.setCurrentContext(currentProfile, currentRegion);
      
      // Update status bar
      updateStatusBar();

      // Load parameters
      await loadParameters();

    } catch (error) {
      console.error('Failed to initialize extension:', error);
      vscode.window.showErrorMessage(`Failed to initialize AWS Parameter Store extension: ${error}`);
    }
  }

  async function loadParameters() {
    if (!currentProfile || !currentRegion) {
      return;
    }

    try {
      treeView.message = 'Loading parameters...';
      
      await parameterStoreService.initialize(currentProfile, currentRegion);
      const parameters = await parameterStoreService.getParameters();
      
      treeProvider.setParameters(parameters);
      treeView.message = parameters.length === 0 ? 'No parameters found' : undefined;

    } catch (error) {
      // Enhanced error handling with specific AWS error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('AccessDenied') || errorMessage.includes('UnauthorizedOperation')) {
        vscode.window.showErrorMessage(`Access denied: Your AWS profile '${currentProfile}' doesn't have permission to list parameters. Check your IAM permissions.`);
        treeView.message = 'Access denied - check IAM permissions';
      } else if (errorMessage.includes('InvalidUserID.NotFound') || errorMessage.includes('SignatureDoesNotMatch')) {
        vscode.window.showErrorMessage(`Invalid AWS credentials for profile '${currentProfile}'. Please check your credentials.`);
        treeView.message = 'Invalid credentials';
      } else if (errorMessage.includes('NetworkingError') || errorMessage.includes('ENOTFOUND')) {
        vscode.window.showErrorMessage(`Network error: Unable to connect to AWS. Check your internet connection.`);
        treeView.message = 'Network error';
      } else {
        vscode.window.showErrorMessage(`Failed to load parameters: ${errorMessage}`);
        treeView.message = 'Failed to load parameters';
      }
      
      treeProvider.setParameters([]);
    }
  }

  function updateStatusBar() {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = `$(cloud) ${currentProfile}@${currentRegion}`;
    statusBarItem.tooltip = `AWS Profile: ${currentProfile}\nRegion: ${currentRegion}`;
    statusBarItem.command = 'awsParameterStore.selectProfile';
    statusBarItem.show();
    
    context.subscriptions.push(statusBarItem);
  }

  // Command: Refresh
  const refreshCommand = vscode.commands.registerCommand('awsParameterStore.refresh', async () => {
    await loadParameters();
  });

  // Command: Select Profile
  const selectProfileCommand = vscode.commands.registerCommand('awsParameterStore.selectProfile', async () => {
    if (availableProfiles.length === 0) {
      vscode.window.showWarningMessage('No AWS profiles available');
      return;
    }

    const profileItems = availableProfiles.map(profile => ({
      label: profile.name,
      description: profile.region ? `Region: ${profile.region}` : undefined,
      profile: profile
    }));

    const selectedItem = await vscode.window.showQuickPick(profileItems, {
      placeHolder: 'Select AWS Profile',
      matchOnDescription: true
    });

    if (selectedItem) {
      currentProfile = selectedItem.profile.name;
      
      // Update region based on profile or keep current
      const profileRegion = profileService.getRegionForProfile(currentProfile);
      if (profileRegion) {
        currentRegion = profileRegion;
      }
      
      treeProvider.setCurrentContext(currentProfile, currentRegion);
      updateStatusBar();
      await loadParameters();
    }
  });

  // Command: Select Region
  const selectRegionCommand = vscode.commands.registerCommand('awsParameterStore.selectRegion', async () => {
    const regionItems = awsRegions.map(region => ({
      label: region,
      description: region === currentRegion ? '(current)' : undefined
    }));

    const selectedRegion = await vscode.window.showQuickPick(regionItems, {
      placeHolder: 'Select AWS Region'
    });

    if (selectedRegion) {
      currentRegion = selectedRegion.label;
      treeProvider.setCurrentContext(currentProfile, currentRegion);
      updateStatusBar();
      await loadParameters();
    }
  });

  // Command: Create Parameter
  const createParameterCommand = vscode.commands.registerCommand('awsParameterStore.createParameter', async () => {
    await openParameterEditor(null, parameterStoreService);
  });

  // Command: Edit Parameter (with secure value loading)
  const editParameterCommand = vscode.commands.registerCommand('awsParameterStore.editParameter', async (item: ParameterTreeItem) => {
    if (!item.parameter || !item.parameter.name) {
      return;
    }

    try {
      const parameter = item.parameter;
      const isSecure = parameter.type === 'SecureString';
      
      // SECURITY: Ask for confirmation before loading secure values
      if (isSecure) {
        const confirm = await vscode.window.showWarningMessage(
          `⚠️ You are about to edit secure parameter '${parameter.name}'. This will decrypt the value using your AWS permissions.`,
          { modal: true },
          'Edit Securely'
        );
        
        if (confirm !== 'Edit Securely') {
          return;
        }
      }

      // Fetch the full parameter with value
      const fullParameter = await parameterStoreService.getParameter(parameter.name, true);
      
      if (fullParameter) {
        await openParameterEditor(fullParameter, parameterStoreService);
      } else {
        vscode.window.showWarningMessage('Parameter not found or could not be loaded');
      }
    } catch (error) {
      // Enhanced error handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('AccessDenied') || errorMessage.includes('UnauthorizedOperation')) {
        vscode.window.showErrorMessage(`Access denied: Your AWS profile doesn't have permission to access this parameter. Check your IAM permissions.`);
      } else if (errorMessage.includes('ParameterNotFound')) {
        vscode.window.showErrorMessage(`Parameter '${item.parameter.name}' not found.`);
      } else if (errorMessage.includes('InvalidKeyId')) {
        vscode.window.showErrorMessage(`Invalid KMS key for secure parameter. Check your KMS permissions.`);
      } else {
        vscode.window.showErrorMessage(`Failed to load parameter: ${errorMessage}`);
      }
    }
  });

  // Command: Delete Parameter
  const deleteParameterCommand = vscode.commands.registerCommand('awsParameterStore.deleteParameter', async (item: ParameterTreeItem) => {
    if (!item.parameter.name) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete parameter '${item.parameter.name}'?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      try {
        await parameterStoreService.deleteParameter(item.parameter.name);
        vscode.window.showInformationMessage(`Parameter '${item.parameter.name}' deleted successfully.`);
        await loadParameters();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete parameter: ${error}`);
      }
    }
  });

  // Command: Copy Parameter Name
  const copyParameterNameCommand = vscode.commands.registerCommand('awsParameterStore.copyParameterName', async (item: ParameterTreeItem) => {
    if (item.parameter.name) {
      await vscode.env.clipboard.writeText(item.parameter.name);
      vscode.window.showInformationMessage(`Copied parameter name: ${item.parameter.name}`);
    }
  });

  // Command: Copy Parameter Value
  const copyParameterValueCommand = vscode.commands.registerCommand('awsParameterStore.copyParameterValue', async (item: ParameterTreeItem) => {
    if (!item.parameter.name) {
      return;
    }

    try {
      const isSecure = item.parameter.type === 'SecureString';
      
      // SECURITY: Ask for confirmation before copying secure values
      if (isSecure) {
        const confirm = await vscode.window.showWarningMessage(
          `⚠️ You are about to copy the value of secure parameter '${item.parameter.name}' to clipboard.`,
          { modal: true },
          'Copy Securely'
        );
        
        if (confirm !== 'Copy Securely') {
          return;
        }
      }

      const parameter = await parameterStoreService.getParameter(item.parameter.name, true);
      if (parameter && parameter.value) {
        await vscode.env.clipboard.writeText(parameter.value);
        vscode.window.showInformationMessage(`${isSecure ? '🔒 ' : ''}Copied parameter value for: ${parameter.name}`);
      } else {
        vscode.window.showWarningMessage('Parameter value not found or empty');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('AccessDenied') || errorMessage.includes('UnauthorizedOperation')) {
        vscode.window.showErrorMessage(`Access denied: Cannot access parameter '${item.parameter.name}'. Check your IAM permissions.`);
      } else {
        vscode.window.showErrorMessage(`Failed to copy parameter value: ${errorMessage}`);
      }
    }
  });

  // Register commands
  context.subscriptions.push(
    refreshCommand,
    selectProfileCommand,
    selectRegionCommand,
    createParameterCommand,
    editParameterCommand,
    deleteParameterCommand,
    copyParameterNameCommand,
    copyParameterValueCommand,
    treeView
  );

  // Initialize the extension
  initialize();
}

export function deactivate() {
  console.log('AWS Parameter Store extension is now deactivated');
}

