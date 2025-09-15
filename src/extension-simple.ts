import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('AWS Parameter Store extension is activating...');
  
  try {
    // Simple command registration
    const disposable = vscode.commands.registerCommand('awsParameterStore.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from AWS Parameter Store!');
    });

    context.subscriptions.push(disposable);
    
    console.log('AWS Parameter Store extension is now active!');
    vscode.window.showInformationMessage('AWS Parameter Store extension loaded successfully!');
    
  } catch (error) {
    console.error('Failed to activate AWS Parameter Store extension:', error);
    vscode.window.showErrorMessage(`Failed to activate AWS Parameter Store extension: ${error}`);
  }
}

export function deactivate() {
  console.log('AWS Parameter Store extension is now deactivated');
}
