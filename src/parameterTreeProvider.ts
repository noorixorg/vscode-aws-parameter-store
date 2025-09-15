import * as vscode from 'vscode';
import { ParameterStoreItem } from './types';

export class ParameterTreeItem extends vscode.TreeItem {
  constructor(
    public readonly parameter: ParameterStoreItem,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(parameter.name, collapsibleState);
    
    this.tooltip = this.createTooltip();
    this.description = this.createDescription();
    this.contextValue = 'parameter';
    this.iconPath = this.getIcon();
  }

  private createTooltip(): string {
    const lines = [
      `Name: ${this.parameter.name}`,
      `Type: ${this.parameter.type}`,
      `Version: ${this.parameter.version || 'N/A'}`
    ];
    
    if (this.parameter.description) {
      lines.push(`Description: ${this.parameter.description}`);
    }
    
    if (this.parameter.lastModifiedDate) {
      lines.push(`Last Modified: ${this.parameter.lastModifiedDate.toLocaleString()}`);
    }
    
    return lines.join('\n');
  }

  private createDescription(): string {
    const parts = [];
    
    if (this.parameter.type === 'SecureString') {
      parts.push('🔒');
    }
    
    parts.push(this.parameter.type);
    
    if (this.parameter.version) {
      parts.push(`v${this.parameter.version}`);
    }
    
    return parts.join(' ');
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.parameter.type) {
      case 'SecureString':
        return new vscode.ThemeIcon('lock');
      case 'StringList':
        return new vscode.ThemeIcon('list-unordered');
      default:
        return new vscode.ThemeIcon('symbol-string');
    }
  }
}

export class ParameterTreeProvider implements vscode.TreeDataProvider<ParameterTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ParameterTreeItem | undefined | null | void> = new vscode.EventEmitter<ParameterTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ParameterTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private parameters: ParameterStoreItem[] = [];
  private currentProfile: string | undefined;
  private currentRegion: string | undefined;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setParameters(parameters: ParameterStoreItem[]): void {
    this.parameters = parameters;
    this.refresh();
  }

  setCurrentContext(profile?: string, region?: string): void {
    this.currentProfile = profile;
    this.currentRegion = region;
    this.refresh();
  }

  getTreeItem(element: ParameterTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ParameterTreeItem): Thenable<ParameterTreeItem[]> {
    if (!element) {
      // Root level - show all parameters as flat list
      return Promise.resolve(this.getParameterItems());
    }
    
    return Promise.resolve([]);
  }

  private getParameterItems(): ParameterTreeItem[] {
    if (this.parameters.length === 0) {
      return [];
    }

    // Show all parameters as a flat list
    return this.parameters.map(param => {
      const item = new ParameterTreeItem(param, vscode.TreeItemCollapsibleState.None);
      // Show the parameter name as label
      item.label = param.name;
      
      // SECURITY: Show type and metadata, but indicate value needs to be fetched
      if (param.type === 'SecureString') {
        item.description = `🔒 ${param.type} (click to edit)`;
      } else {
        item.description = `${param.type} (click to edit)`;
      }
      
      // Add command to edit parameter when clicked (will load value securely)
      item.command = {
        command: 'awsParameterStore.editParameter',
        title: 'Edit Parameter',
        arguments: [item]
      };
      
      return item;
    }).sort((a, b) => a.parameter.name.localeCompare(b.parameter.name));
  }

  private groupParametersByPath(): Map<string, ParameterStoreItem[]> {
    const grouped = new Map<string, ParameterStoreItem[]>();

    for (const param of this.parameters) {
      const pathParts = param.name.split('/').filter(part => part.length > 0);
      
      if (pathParts.length <= 1) {
        // Root level parameter
        if (!grouped.has('')) {
          grouped.set('', []);
        }
        grouped.get('')!.push(param);
      } else {
        // Parameter with path
        const path = '/' + pathParts.slice(0, -1).join('/');
        if (!grouped.has(path)) {
          grouped.set(path, []);
        }
        grouped.get(path)!.push(param);
      }
    }

    return grouped;
  }

  private createFolderItem(path: string, parameters: ParameterStoreItem[]): ParameterTreeItem {
    const folderName = path.split('/').pop() || path;
    const dummyParameter: ParameterStoreItem = {
      name: path,
      type: 'String',
      description: `Folder containing ${parameters.length} parameter(s)`
    };
    
    const item = new ParameterTreeItem(dummyParameter, vscode.TreeItemCollapsibleState.Expanded);
    item.label = folderName;
    item.tooltip = `${path}\nContains ${parameters.length} parameter(s)`;
    item.iconPath = new vscode.ThemeIcon('folder');
    item.contextValue = 'folder';
    
    return item;
  }

  getParameter(name: string): ParameterStoreItem | undefined {
    return this.parameters.find(p => p.name === name);
  }

  getCurrentContext(): { profile?: string; region?: string } {
    return {
      profile: this.currentProfile,
      region: this.currentRegion
    };
  }
}
