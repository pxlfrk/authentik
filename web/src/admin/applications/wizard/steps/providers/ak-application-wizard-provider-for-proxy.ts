import "#admin/applications/wizard/ak-wizard-title";

import { ApplicationWizardProviderForm } from "./ApplicationWizardProviderForm.js";

import { WizardUpdateEvent } from "#components/ak-wizard/events";

import { ValidationRecord } from "#admin/applications/wizard/types";
import {
    ProxyModeValue,
    renderForm,
    type SetMode,
    type SetShowHttpBasic,
} from "#admin/providers/proxy/ProxyProviderFormForm";

import { ProxyMode, ProxyProvider } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("ak-application-wizard-provider-for-proxy")
export class ApplicationWizardProxyProviderForm extends ApplicationWizardProviderForm<ProxyProvider> {
    label = msg("Configure Proxy Provider");

    @state()
    showHttpBasic = true;

    renderForm(provider: ProxyProvider, errors: ValidationRecord) {
        const onSetMode: SetMode = (ev: CustomEvent<ProxyModeValue>) => {
            this.dispatchEvent(
                new WizardUpdateEvent({ ...this.wizard, proxyMode: ev.detail.value }),
            );
            // We deliberately chose not to make the forms "controlled," but we do need this form to
            // respond immediately to a state change in the wizard.
            window.setTimeout(() => this.requestUpdate(), 0);
        };

        const onSetShowHttpBasic: SetShowHttpBasic = (ev: Event) => {
            const el = ev.target as HTMLInputElement;
            this.showHttpBasic = el.checked;
        };

        return html` <ak-wizard-title>${this.label}</ak-wizard-title>
            <form id="providerform" class="pf-c-form pf-m-horizontal" slot="form">
                ${renderForm(provider ?? {}, errors ?? [], {
                    mode: this.wizard.proxyMode ?? ProxyMode.Proxy,
                    onSetMode,
                    showHttpBasic: this.showHttpBasic,
                    onSetShowHttpBasic,
                })}
            </form>`;
    }

    render() {
        if (!(this.wizard.provider && this.wizard.errors)) {
            throw new Error("Proxy Provider Step received uninitialized wizard context.");
        }
        return this.renderForm(
            this.wizard.provider as ProxyProvider,
            this.wizard.errors?.provider ?? {},
        );
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-application-wizard-provider-for-proxy": ApplicationWizardProxyProviderForm;
    }
}
