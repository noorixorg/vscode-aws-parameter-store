export interface AwsProfile {
  name: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  roleArn?: string;
  sourceProfile?: string;
}

export interface ParameterStoreItem {
  name: string;
  type: 'String' | 'StringList' | 'SecureString';
  value?: string;
  description?: string;
  lastModifiedDate?: Date;
  version?: number;
  dataType?: string;
}

export interface ExtensionState {
  currentProfile?: string;
  currentRegion?: string;
  profiles: AwsProfile[];
  parameters: ParameterStoreItem[];
}
