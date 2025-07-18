---
title: Integrate with ArgoCD
sidebar_label: ArgoCD
support_level: community
---

## What is ArgoCD

> Argo CD is a declarative, GitOps continuous delivery tool for Kubernetes.
>
> -- https://argoproj.github.io/cd/

## Preparation

The following placeholders are used in this guide:

- `argocd.company` is the FQDN of the ArgoCD installation.
- `authentik.company` is the FQDN of the authentik installation.

:::note
This documentation lists only the settings that you need to change from their default values. Be aware that any changes other than those explicitly mentioned in this guide could cause issues accessing your application.
:::

## authentik configuration

To support the integration of ArgoCD with authentik, you need to create an application/provider pair in authentik.

### Create an application and provider in authentik

1. Log in to authentik as an administrator and open the authentik Admin interface.
2. Navigate to **Applications** > **Applications** and click **Create with Provider** to create an application and provider pair. (Alternatively you can first create a provider separately, then create the application and connect it with the provider.)
    - **Application**: provide a descriptive name, an optional group for the type of application, the policy engine mode, and optional UI settings.
    - **Choose a Provider type**: select **OAuth2/OpenID Connect** as the provider type.
    - **Configure the Provider**: provide a name (or accept the auto-provided name), the authorization flow to use for this provider, and the following required configurations.
        - Note the **Client ID**,**Client Secret**, and **slug** values because they will be required later.
        - Add two `Strict` redirect URI and set them to `https://argocd.company/api/dex/callback` and `https://localhost:8085/auth/callback`.
        - Select any available signing key.
    - **Configure Bindings** _(optional)_: you can create a [binding](/docs/add-secure-apps/flows-stages/bindings/) (policy, group, or user) to manage the listing and access to applications on a user's **My applications** page.

3. Click **Submit** to save the new application and provider.

### Create the users and administrator groups

Using the authentik Admin interface, navigate to **Directory** > **Groups** and click **Create** to create two required groups: `ArgoCD Admins` for administrator users and `ArgoCD Viewers` for read-only users.

After creating the groups, select a group, navigate to the **Users** tab, and manage its members by using the **Add existing user** and **Create user** buttons as needed.

## ArgoCD Configuration

:::note
We're not going to use the oidc config, but instead the "dex", oidc doesn't allow ArgoCD CLI usage while DEX does.
:::

### Step 1 - Add the OIDC Secret to ArgoCD

In the `argocd-secret` Secret, add the following value to the `data` field:

```yaml
dex.authentik.clientSecret: <base 64 encoded value of the Client Secret from the Provider above>
```

If using Helm, the above can be added to `configs.secret.extra` in your ArgoCD Helm `values.yaml` file as shown below, securely substituting the string however you see fit:

```yaml
configs:
    secret:
        extra:
            dex.authentik.clientSecret: "${argocd_authentik_client_secret}"
```

### Step 2 - Configure ArgoCD to use authentik as OIDC backend

In the `argocd-cm` ConfigMap, add the following to the data field :

```yaml
url: https://argocd.company
dex.config: |
    connectors:
    - config:
        issuer: https://authentik.company/application/o/<application_slug>/
        clientID: <client ID from the Provider above>
        clientSecret: $dex.authentik.clientSecret
        insecureEnableGroups: true
        scopes:
          - openid
          - profile
          - email
      name: authentik
      type: oidc
      id: authentik
```

### Step 3 - Map the `ArgoCD Admins` group to ArgoCD's admin role

In the `argocd-rbac-cm` ConfigMap, add the following to the data field (or create it if it's not already there) :

```yaml
policy.csv: |
    g, ArgoCD Admins, role:admin
    g, ArgoCD Viewers, role:readonly
```

If you already had an "admin" group and thus didn't create the `ArgoCD Admins` one, just replace `ArgoCD Admins` with your existing group name.
If you did not opt to create a read-only group, or chose to use one with a different name in authentik, rename or remove here accordingly.

Apply all the modified manifests, and you should be able to login to ArgoCD both through the UI and the CLI.
