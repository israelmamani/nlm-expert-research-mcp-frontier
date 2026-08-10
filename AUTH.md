# Authentication

Frontier uses a dedicated persistent Chrome profile. Run:

```powershell
npm run setup-auth -- --force
```

Enter credentials only in Google's visible browser window. Frontier never requests a password, automates 2FA, or accepts credentials in environment variables. Successful login stores Google session cookies and browser state locally under the configured upstream data directory; protect that directory as sensitive account material.

When `NLM_AUTO_REAUTH=1` (default), a confirmed session expiry stops the hidden transport, opens one visible recovery window, and retries the original operation once. Concurrent failures share the same recovery. Cancellation, an 11-minute timeout, or a second authentication rejection fails closed without a loop.
