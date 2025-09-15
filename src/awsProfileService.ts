import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AwsProfile } from './types';

export class AwsProfileService {
  private profiles: AwsProfile[] = [];
  private credentialsPath: string;
  private configPath: string;

  constructor() {
    const homeDir = os.homedir();
    this.credentialsPath = path.join(homeDir, '.aws', 'credentials');
    this.configPath = path.join(homeDir, '.aws', 'config');
  }

  async loadProfiles(): Promise<AwsProfile[]> {
    this.profiles = [];
    
    // Load profiles from credentials file
    await this.loadCredentialsFile();
    
    // Load additional config from config file
    await this.loadConfigFile();
    
    return this.profiles;
  }

  private async loadCredentialsFile(): Promise<void> {
    if (!fs.existsSync(this.credentialsPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.credentialsPath, 'utf8');
      const profiles = this.parseIniFile(content);
      
      for (const [profileName, config] of Object.entries(profiles)) {
        this.profiles.push({
          name: profileName,
          accessKeyId: config.aws_access_key_id,
          secretAccessKey: config.aws_secret_access_key,
          sessionToken: config.aws_session_token,
          region: config.region,
          roleArn: config.role_arn,
          sourceProfile: config.source_profile
        });
      }
    } catch (error) {
      console.error('Error loading AWS credentials file:', error);
    }
  }

  private async loadConfigFile(): Promise<void> {
    if (!fs.existsSync(this.configPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      const configs = this.parseIniFile(content);
      
      for (const [sectionName, config] of Object.entries(configs)) {
        let profileName = sectionName;
        
        // Handle profile prefix in config file
        if (sectionName.startsWith('profile ')) {
          profileName = sectionName.substring(8);
        }
        
        // Find existing profile or create new one
        let profile = this.profiles.find(p => p.name === profileName);
        if (!profile) {
          profile = { name: profileName };
          this.profiles.push(profile);
        }
        
        // Merge config values
        if (config.region) {
          profile.region = config.region;
        }
        if (config.role_arn) {
          profile.roleArn = config.role_arn;
        }
        if (config.source_profile) {
          profile.sourceProfile = config.source_profile;
        }
      }
    } catch (error) {
      console.error('Error loading AWS config file:', error);
    }
  }

  private parseIniFile(content: string): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    const lines = content.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith(';')) {
        continue;
      }
      
      // Check for section headers
      const sectionMatch = trimmedLine.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        result[currentSection] = {};
        continue;
      }
      
      // Parse key-value pairs
      const keyValueMatch = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (keyValueMatch && currentSection) {
        const key = keyValueMatch[1].trim();
        const value = keyValueMatch[2].trim();
        result[currentSection][key] = value;
      }
    }
    
    return result;
  }

  getProfiles(): AwsProfile[] {
    return this.profiles;
  }

  getProfile(profileName: string): AwsProfile | undefined {
    return this.profiles.find(p => p.name === profileName);
  }

  getDefaultProfile(): AwsProfile | undefined {
    return this.getProfile('default') || this.profiles[0];
  }

  getRegionForProfile(profileName: string): string | undefined {
    const profile = this.getProfile(profileName);
    if (profile?.region) {
      return profile.region;
    }
    
    // If profile has source_profile, check that profile's region
    if (profile?.sourceProfile) {
      const sourceProfile = this.getProfile(profile.sourceProfile);
      return sourceProfile?.region;
    }
    
    return undefined;
  }
}

