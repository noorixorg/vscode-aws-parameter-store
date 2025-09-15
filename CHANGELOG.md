# Change Log

All notable changes to the "aws-parameter-store" extension will be documented in this file.

## [0.0.1] - 2025-09-15

### Added
- Initial release of AWS Parameter Store extension
- AWS profile detection from local credentials
- Region selection with profile defaults
- Parameter tree view in Explorer sidebar
- Parameter creation, editing, and deletion
- Support for String, StringList, and SecureString parameters
- Copy parameter names and values to clipboard
- Secure parameter decryption support
- Real-time parameter refresh
- Status bar integration showing current profile and region

### Features
- **Profile Management**: Automatically detects AWS profiles from `~/.aws/credentials` and `~/.aws/config`
- **Multi-Region Support**: Easy region switching with profile-based defaults
- **Parameter Operations**: Full CRUD operations for Parameter Store
- **Security**: Proper handling of SecureString parameters with KMS decryption
- **User Experience**: Intuitive tree view with contextual menus and quick actions

