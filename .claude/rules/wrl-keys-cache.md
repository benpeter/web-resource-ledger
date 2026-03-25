`~/.wrl-keys` is a shell-sourceable file (mode 600) with all WRL secrets
from 1Password vault "WRL", prefixed with `WRL_STAGING_` and `WRL_PROD_`.

Source of truth is 1Password -- this file is a convenience cache.
Regenerate by running `op item get "Staging"/"Production" --vault WRL --reveal`.

Usage in orchestrator scripts:
```bash
source ~/.wrl-keys
echo $WRL_STAGING_ADMIN_KEY
```
