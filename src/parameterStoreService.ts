import { 
  SSMClient, 
  GetParametersCommand, 
  GetParametersByPathCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  DescribeParametersCommand,
  Parameter,
  ParameterMetadata,
  ParameterType
} from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { ParameterStoreItem } from './types';

export class ParameterStoreService {
  private client: SSMClient | undefined;
  private currentProfile: string | undefined;
  private currentRegion: string | undefined;

  async initialize(profile: string, region: string): Promise<void> {
    this.currentProfile = profile;
    this.currentRegion = region;
    
    try {
      const credentials = fromIni({ profile });
      this.client = new SSMClient({
        region,
        credentials
      });
    } catch (error) {
      console.error('Failed to initialize Parameter Store client:', error);
      throw new Error(`Failed to initialize AWS client with profile "${profile}" and region "${region}"`);
    }
  }

  async getParameters(path?: string, recursive: boolean = true): Promise<ParameterStoreItem[]> {
    if (!this.client) {
      throw new Error('Parameter Store client not initialized');
    }

    const parameters: ParameterStoreItem[] = [];
    
    try {
      // SECURITY: Only get metadata, never fetch values automatically
      const command = new DescribeParametersCommand({
        MaxResults: 50
      });
      
      let nextToken: string | undefined;
      
      do {
        if (nextToken) {
          command.input.NextToken = nextToken;
        }
        
        const response = await this.client.send(command);
        
        if (response.Parameters) {
          for (const paramMetadata of response.Parameters) {
            parameters.push(this.convertMetadataToParameterStoreItem(paramMetadata));
          }
        }
        
        nextToken = response.NextToken;
      } while (nextToken);
      
    } catch (error) {
      console.error('Error fetching parameters:', error);
      throw new Error(`Failed to fetch parameters: ${error}`);
    }
    
    return parameters.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getParameter(name: string, withDecryption: boolean = true): Promise<ParameterStoreItem | undefined> {
    if (!this.client) {
      throw new Error('Parameter Store client not initialized');
    }

    try {
      const command = new GetParametersCommand({
        Names: [name],
        WithDecryption: withDecryption
      });
      
      const response = await this.client.send(command);
      
      if (response.Parameters && response.Parameters.length > 0) {
        return this.convertToParameterStoreItem(response.Parameters[0]);
      }
    } catch (error) {
      console.error(`Error fetching parameter ${name}:`, error);
    }
    
    return undefined;
  }

  async putParameter(
    name: string, 
    value: string, 
    type: ParameterType = ParameterType.STRING,
    description?: string,
    overwrite: boolean = false
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Parameter Store client not initialized');
    }

    try {
      const command = new PutParameterCommand({
        Name: name,
        Value: value,
        Type: type,
        Description: description,
        Overwrite: overwrite
      });
      
      await this.client.send(command);
    } catch (error) {
      console.error(`Error putting parameter ${name}:`, error);
      throw new Error(`Failed to save parameter: ${error}`);
    }
  }

  async deleteParameter(name: string): Promise<void> {
    if (!this.client) {
      throw new Error('Parameter Store client not initialized');
    }

    try {
      const command = new DeleteParameterCommand({
        Name: name
      });
      
      await this.client.send(command);
    } catch (error) {
      console.error(`Error deleting parameter ${name}:`, error);
      throw new Error(`Failed to delete parameter: ${error}`);
    }
  }

  private convertToParameterStoreItem(param: Parameter): ParameterStoreItem {
    return {
      name: param.Name || '',
      type: (param.Type as 'String' | 'StringList' | 'SecureString') || 'String',
      value: param.Value,
      version: param.Version,
      lastModifiedDate: param.LastModifiedDate,
      dataType: param.DataType
    };
  }

  private convertMetadataToParameterStoreItem(paramMetadata: ParameterMetadata): ParameterStoreItem {
    return {
      name: paramMetadata.Name || '',
      type: (paramMetadata.Type as 'String' | 'StringList' | 'SecureString') || 'String',
      description: paramMetadata.Description,
      version: paramMetadata.Version,
      lastModifiedDate: paramMetadata.LastModifiedDate,
      dataType: paramMetadata.DataType,
      // SECURITY: No value included - must be fetched explicitly
      value: undefined
    };
  }

  getCurrentProfile(): string | undefined {
    return this.currentProfile;
  }

  getCurrentRegion(): string | undefined {
    return this.currentRegion;
  }

  isInitialized(): boolean {
    return this.client !== undefined;
  }
}
