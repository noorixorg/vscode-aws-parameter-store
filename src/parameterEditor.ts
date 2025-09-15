import * as vscode from 'vscode';
import { ParameterStoreItem } from './types';
import { ParameterStoreService } from './parameterStoreService';

export class ParameterEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = 'awsParameterStore.parameterEditor';

  constructor(private readonly parameterStoreService: ParameterStoreService) {}

  public static register(context: vscode.ExtensionContext, parameterStoreService: ParameterStoreService): vscode.Disposable {
    const provider = new ParameterEditorProvider(parameterStoreService);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      ParameterEditorProvider.viewType,
      provider
    );
    return providerRegistration;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    function updateWebview() {
      webviewPanel.webview.postMessage({
        type: 'update',
        text: document.getText(),
      });
    }

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage(e => {
      switch (e.type) {
        case 'save':
          this.saveParameter(e.parameter);
          return;
        case 'delete':
          this.deleteParameter(e.parameterName);
          return;
      }
    });

    updateWebview();
  }

  private async saveParameter(parameter: ParameterStoreItem): Promise<void> {
    try {
      await this.parameterStoreService.putParameter(
        parameter.name,
        parameter.value || '',
        parameter.type as any,
        parameter.description,
        true // overwrite
      );
      vscode.window.showInformationMessage(`Parameter '${parameter.name}' saved successfully.`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save parameter: ${error}`);
    }
  }

  private async deleteParameter(parameterName: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete parameter '${parameterName}'?`,
      'Delete',
      'Cancel'
    );

    if (confirm === 'Delete') {
      try {
        await this.parameterStoreService.deleteParameter(parameterName);
        vscode.window.showInformationMessage(`Parameter '${parameterName}' deleted successfully.`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete parameter: ${error}`);
      }
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Parameter Store Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: var(--vscode-input-foreground);
        }
        
        input, textarea, select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-family: inherit;
            font-size: inherit;
        }
        
        textarea {
            min-height: 100px;
            resize: vertical;
            font-family: var(--vscode-editor-font-family);
        }
        
        .secure-warning {
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            padding: 10px;
            border-radius: 3px;
            margin-bottom: 15px;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
        }
        
        .primary-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .primary-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .secondary-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .secondary-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .danger-button {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }
        
        .danger-button:hover {
            opacity: 0.8;
        }
        
        .readonly {
            background-color: var(--vscode-input-background);
            opacity: 0.7;
        }
        
        .metadata {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 10px;
            margin: 15px 0;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Parameter Store Editor</h1>
        
        <form id="parameterForm">
            <div class="form-group">
                <label for="name">Parameter Name</label>
                <input type="text" id="name" required>
            </div>
            
            <div class="form-group">
                <label for="type">Type</label>
                <select id="type">
                    <option value="String">String</option>
                    <option value="StringList">StringList</option>
                    <option value="SecureString">SecureString</option>
                </select>
            </div>
            
            <div id="secureWarning" class="secure-warning" style="display: none;">
                <strong>⚠️ Security Warning:</strong> This parameter contains sensitive data and will be encrypted using AWS KMS.
            </div>
            
            <div class="form-group">
                <label for="value">Value</label>
                <textarea id="value" placeholder="Enter parameter value..."></textarea>
            </div>
            
            <div class="form-group">
                <label for="description">Description (Optional)</label>
                <input type="text" id="description" placeholder="Brief description of this parameter">
            </div>
            
            <div id="metadata" class="metadata" style="display: none;">
                <h3>Parameter Metadata</h3>
                <div id="metadataContent"></div>
            </div>
            
            <div class="button-group">
                <button type="submit" class="primary-button">Save Parameter</button>
                <button type="button" id="deleteButton" class="danger-button">Delete Parameter</button>
                <button type="button" id="cancelButton" class="secondary-button">Cancel</button>
            </div>
        </form>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        let currentParameter = null;
        
        // Form elements
        const form = document.getElementById('parameterForm');
        const nameInput = document.getElementById('name');
        const typeSelect = document.getElementById('type');
        const valueTextarea = document.getElementById('value');
        const descriptionInput = document.getElementById('description');
        const deleteButton = document.getElementById('deleteButton');
        const cancelButton = document.getElementById('cancelButton');
        const secureWarning = document.getElementById('secureWarning');
        const metadata = document.getElementById('metadata');
        const metadataContent = document.getElementById('metadataContent');
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    try {
                        currentParameter = JSON.parse(message.text);
                        populateForm(currentParameter);
                    } catch (error) {
                        console.error('Error parsing parameter data:', error);
                    }
                    break;
            }
        });
        
        function populateForm(parameter) {
            nameInput.value = parameter.name || '';
            typeSelect.value = parameter.type || 'String';
            valueTextarea.value = parameter.value || '';
            descriptionInput.value = parameter.description || '';
            
            updateSecureWarning();
            updateMetadata(parameter);
            
            // If this is an existing parameter, make name readonly
            if (parameter.version) {
                nameInput.readOnly = true;
                nameInput.classList.add('readonly');
                deleteButton.style.display = 'inline-block';
            } else {
                nameInput.readOnly = false;
                nameInput.classList.remove('readonly');
                deleteButton.style.display = 'none';
            }
        }
        
        function updateSecureWarning() {
            if (typeSelect.value === 'SecureString') {
                secureWarning.style.display = 'block';
            } else {
                secureWarning.style.display = 'none';
            }
        }
        
        function updateMetadata(parameter) {
            if (parameter.version) {
                let metadataHtml = '';
                if (parameter.version) metadataHtml += '<p><strong>Version:</strong> ' + parameter.version + '</p>';
                if (parameter.lastModifiedDate) metadataHtml += '<p><strong>Last Modified:</strong> ' + new Date(parameter.lastModifiedDate).toLocaleString() + '</p>';
                if (parameter.dataType) metadataHtml += '<p><strong>Data Type:</strong> ' + parameter.dataType + '</p>';
                
                metadataContent.innerHTML = metadataHtml;
                metadata.style.display = 'block';
            } else {
                metadata.style.display = 'none';
            }
        }
        
        // Event listeners
        typeSelect.addEventListener('change', updateSecureWarning);
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const parameter = {
                name: nameInput.value.trim(),
                type: typeSelect.value,
                value: valueTextarea.value,
                description: descriptionInput.value.trim() || undefined,
                version: currentParameter?.version,
                lastModifiedDate: currentParameter?.lastModifiedDate
            };
            
            if (!parameter.name) {
                alert('Parameter name is required');
                return;
            }
            
            vscode.postMessage({
                type: 'save',
                parameter: parameter
            });
        });
        
        deleteButton.addEventListener('click', () => {
            if (currentParameter && currentParameter.name) {
                vscode.postMessage({
                    type: 'delete',
                    parameterName: currentParameter.name
                });
            }
        });
        
        cancelButton.addEventListener('click', () => {
            // Reset form or close editor
            if (currentParameter) {
                populateForm(currentParameter);
            } else {
                form.reset();
                updateSecureWarning();
                metadata.style.display = 'none';
            }
        });
    </script>
</body>
</html>`;
  }
}

function getParameterEditorHtml(parameter: ParameterStoreItem): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Parameter Store Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: var(--vscode-input-foreground);
        }
        
        input, textarea, select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-family: inherit;
            font-size: inherit;
            box-sizing: border-box;
        }
        
        textarea {
            min-height: 100px;
            resize: vertical;
            font-family: var(--vscode-editor-font-family);
        }
        
        .secure-warning {
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            padding: 10px;
            border-radius: 3px;
            margin-bottom: 15px;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
        }
        
        .primary-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .primary-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .secondary-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .secondary-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .readonly {
            background-color: var(--vscode-input-background);
            opacity: 0.7;
        }
        
        .metadata {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 10px;
            margin: 15px 0;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Parameter Store Editor</h1>
        
        <form id="parameterForm">
            <div class="form-group">
                <label for="name">Parameter Name</label>
                <input type="text" id="name" value="${parameter.name || ''}" ${parameter.name ? 'readonly class="readonly"' : ''} required>
            </div>
            
            <div class="form-group">
                <label for="type">Type</label>
                <select id="type">
                    <option value="String" ${parameter.type === 'String' ? 'selected' : ''}>String</option>
                    <option value="StringList" ${parameter.type === 'StringList' ? 'selected' : ''}>StringList</option>
                    <option value="SecureString" ${parameter.type === 'SecureString' ? 'selected' : ''}>SecureString</option>
                </select>
            </div>
            
            <div id="secureWarning" class="secure-warning" style="display: ${parameter.type === 'SecureString' ? 'block' : 'none'};">
                <strong>🔒 Security Warning:</strong> This parameter contains sensitive data and will be encrypted using AWS KMS.
            </div>
            
            <div class="form-group">
                <label for="value">Value</label>
                <textarea id="value" placeholder="Enter parameter value...">${parameter.value || ''}</textarea>
            </div>
            
            <div class="form-group">
                <label for="description">Description (Optional)</label>
                <input type="text" id="description" value="${parameter.description || ''}" placeholder="Brief description of this parameter">
            </div>
            
            ${parameter.version ? `
            <div class="metadata">
                <h3>Parameter Metadata</h3>
                <p><strong>Version:</strong> ${parameter.version}</p>
                ${parameter.lastModifiedDate ? `<p><strong>Last Modified:</strong> ${new Date(parameter.lastModifiedDate).toLocaleString()}</p>` : ''}
                ${parameter.dataType ? `<p><strong>Data Type:</strong> ${parameter.dataType}</p>` : ''}
            </div>
            ` : ''}
            
            <div class="button-group">
                <button type="submit" class="primary-button">💾 Save to AWS Parameter Store</button>
                <button type="button" id="cancelButton" class="secondary-button">Cancel</button>
            </div>
        </form>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Form elements
        const form = document.getElementById('parameterForm');
        const nameInput = document.getElementById('name');
        const typeSelect = document.getElementById('type');
        const valueTextarea = document.getElementById('value');
        const descriptionInput = document.getElementById('description');
        const cancelButton = document.getElementById('cancelButton');
        const secureWarning = document.getElementById('secureWarning');
        
        // Update secure warning when type changes
        typeSelect.addEventListener('change', () => {
            if (typeSelect.value === 'SecureString') {
                secureWarning.style.display = 'block';
            } else {
                secureWarning.style.display = 'none';
            }
        });
        
        // Handle form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const parameter = {
                name: nameInput.value.trim(),
                type: typeSelect.value,
                value: valueTextarea.value,
                description: descriptionInput.value.trim() || undefined
            };
            
            if (!parameter.name) {
                alert('Parameter name is required');
                return;
            }
            
            if (!parameter.value) {
                alert('Parameter value is required');
                return;
            }
            
            // Send save message to extension
            vscode.postMessage({
                type: 'save',
                parameter: parameter
            });
        });
        
        // Handle cancel
        cancelButton.addEventListener('click', () => {
            vscode.postMessage({
                type: 'cancel'
            });
        });
    </script>
</body>
</html>`;
}

export async function openParameterEditor(parameter: ParameterStoreItem | null = null, parameterStoreService: ParameterStoreService): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'awsParameterEditor',
    parameter ? `Edit: ${parameter.name}` : 'New Parameter',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const parameterData = parameter || {
    name: '',
    type: 'String' as const,
    value: '',
    description: ''
  };

  panel.webview.html = getParameterEditorHtml(parameterData);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'save':
        try {
          await parameterStoreService.putParameter(
            message.parameter.name,
            message.parameter.value,
            message.parameter.type as any,
            message.parameter.description,
            true // overwrite
          );
          
          vscode.window.showInformationMessage(`✅ Parameter '${message.parameter.name}' saved successfully to AWS Parameter Store!`);
          
          // Refresh the tree view
          vscode.commands.executeCommand('awsParameterStore.refresh');
          
          // Close the panel
          panel.dispose();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          if (errorMessage.includes('AccessDenied')) {
            vscode.window.showErrorMessage(`❌ Access denied: Cannot save parameter '${message.parameter.name}'. Check your IAM permissions.`);
          } else if (errorMessage.includes('ValidationException')) {
            vscode.window.showErrorMessage(`❌ Invalid parameter: ${errorMessage}`);
          } else {
            vscode.window.showErrorMessage(`❌ Failed to save parameter: ${errorMessage}`);
          }
        }
        break;
        
      case 'cancel':
        panel.dispose();
        break;
    }
  });
}
