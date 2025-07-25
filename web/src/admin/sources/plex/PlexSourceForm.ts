import "#admin/common/ak-flow-search/ak-source-flow-search";
import "#components/ak-slug-input";
import "#elements/ak-dual-select/ak-dual-select-dynamic-selected-provider";
import "#elements/ak-dual-select/ak-dual-select-provider";
import "#elements/forms/FormGroup";
import "#elements/forms/HorizontalFormElement";
import "#elements/forms/SearchSelect/index";

import { propertyMappingsProvider, propertyMappingsSelector } from "./PlexSourceFormHelpers.js";

import { DEFAULT_CONFIG } from "#common/api/config";
import { PlexAPIClient, PlexResource, popupCenterScreen } from "#common/helpers/plex";
import { ascii_letters, digits, randomString } from "#common/utils";

import { CapabilitiesEnum, WithCapabilitiesConfig } from "#elements/mixins/capabilities";

import { iconHelperText, placeholderHelperText } from "#admin/helperText";
import { policyEngineModes } from "#admin/policies/PolicyEngineModes";
import { BaseSourceForm } from "#admin/sources/BaseSourceForm";
import { GroupMatchingModeToLabel, UserMatchingModeToLabel } from "#admin/sources/oauth/utils";

import {
    FlowsInstancesListDesignationEnum,
    GroupMatchingModeEnum,
    PlexSource,
    SourcesApi,
    UserMatchingModeEnum,
} from "@goauthentik/api";

import { msg } from "@lit/localize";
import { html, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

@customElement("ak-source-plex-form")
export class PlexSourceForm extends WithCapabilitiesConfig(BaseSourceForm<PlexSource>) {
    async loadInstance(pk: string): Promise<PlexSource> {
        const source = await new SourcesApi(DEFAULT_CONFIG).sourcesPlexRetrieve({
            slug: pk,
        });
        this.plexToken = source.plexToken;
        this.loadServers();
        this.clearIcon = false;
        return source;
    }

    @state()
    clearIcon = false;

    @property()
    plexToken?: string;

    @property({ attribute: false })
    plexResources?: PlexResource[];

    get defaultInstance(): PlexSource | undefined {
        return {
            clientId: randomString(40, ascii_letters + digits),
        } as PlexSource;
    }

    async send(data: PlexSource): Promise<PlexSource> {
        data.plexToken = this.plexToken || "";
        let source: PlexSource;
        if (this.instance?.pk) {
            source = await new SourcesApi(DEFAULT_CONFIG).sourcesPlexUpdate({
                slug: this.instance.slug,
                plexSourceRequest: data,
            });
        } else {
            source = await new SourcesApi(DEFAULT_CONFIG).sourcesPlexCreate({
                plexSourceRequest: data,
            });
        }
        if (this.can(CapabilitiesEnum.CanSaveMedia)) {
            const icon = this.files().get("icon");
            if (icon || this.clearIcon) {
                await new SourcesApi(DEFAULT_CONFIG).sourcesAllSetIconCreate({
                    slug: source.slug,
                    file: icon,
                    clear: this.clearIcon,
                });
            }
        } else {
            await new SourcesApi(DEFAULT_CONFIG).sourcesAllSetIconUrlCreate({
                slug: source.slug,
                filePathRequest: {
                    url: data.icon || "",
                },
            });
        }
        return source;
    }

    async doAuth(): Promise<void> {
        const authInfo = await PlexAPIClient.getPin(this.instance?.clientId || "");
        const authWindow = await popupCenterScreen(authInfo.authUrl, "plex auth", 550, 700);
        PlexAPIClient.pinPoll(this.instance?.clientId || "", authInfo.pin.id).then((token) => {
            authWindow?.close();
            this.plexToken = token;
            this.loadServers();
        });
    }

    async loadServers(): Promise<void> {
        if (!this.plexToken) {
            return;
        }
        this.plexResources = await new PlexAPIClient(this.plexToken).getServers();
    }

    renderSettings(): TemplateResult {
        if (!this.plexToken) {
            return html` <button
                class="pf-c-button pf-m-primary"
                type="button"
                @click=${() => {
                    this.doAuth();
                }}
            >
                ${msg("Load servers")}
            </button>`;
        }
        return html` <button
                class="pf-c-button pf-m-secondary"
                type="button"
                @click=${() => {
                    this.doAuth();
                }}
            >
                ${msg("Re-authenticate with Plex")}
            </button>
            <ak-form-element-horizontal name="allowFriends">
                <label class="pf-c-switch">
                    <input
                        class="pf-c-switch__input"
                        type="checkbox"
                        ?checked=${this.instance?.allowFriends ?? true}
                    />
                    <span class="pf-c-switch__toggle">
                        <span class="pf-c-switch__toggle-icon">
                            <i class="fas fa-check" aria-hidden="true"></i>
                        </span>
                    </span>
                    <span class="pf-c-switch__label"
                        >${msg(
                            "Allow friends to authenticate via Plex, even if you don't share any servers",
                        )}</span
                    >
                </label>
            </ak-form-element-horizontal>
            <ak-form-element-horizontal
                label=${msg("Allowed servers")}
                required
                name="allowedServers"
            >
                <select class="pf-c-form-control" multiple>
                    ${this.plexResources?.map((r) => {
                        const selected = Array.from(this.instance?.allowedServers || []).some(
                            (server) => {
                                return server === r.clientIdentifier;
                            },
                        );
                        return html`<option value=${r.clientIdentifier} ?selected=${selected}>
                            ${r.name}
                        </option>`;
                    })}
                </select>
                <p class="pf-c-form__helper-text">
                    ${msg(
                        "Select which server a user has to be a member of to be allowed to authenticate.",
                    )}
                </p>
            </ak-form-element-horizontal>`;
    }

    renderForm(): TemplateResult {
        return html` <ak-form-element-horizontal label=${msg("Name")} required name="name">
                <input
                    type="text"
                    value="${ifDefined(this.instance?.name)}"
                    class="pf-c-form-control"
                    required
                />
            </ak-form-element-horizontal>

            <ak-slug-input
                name="slug"
                value=${ifDefined(this.instance?.slug)}
                label=${msg("Slug")}
                required
                input-hint="code"
            ></ak-slug-input>

            <ak-form-element-horizontal name="enabled">
                <label class="pf-c-switch">
                    <input
                        class="pf-c-switch__input"
                        type="checkbox"
                        ?checked=${this.instance?.enabled ?? true}
                    />
                    <span class="pf-c-switch__toggle">
                        <span class="pf-c-switch__toggle-icon">
                            <i class="fas fa-check" aria-hidden="true"></i>
                        </span>
                    </span>
                    <span class="pf-c-switch__label">${msg("Enabled")}</span>
                </label>
            </ak-form-element-horizontal>
            <ak-form-element-horizontal
                label=${msg("User matching mode")}
                required
                name="userMatchingMode"
            >
                <select class="pf-c-form-control">
                    <option
                        value=${UserMatchingModeEnum.Identifier}
                        ?selected=${this.instance?.userMatchingMode ===
                        UserMatchingModeEnum.Identifier}
                    >
                        ${UserMatchingModeToLabel(UserMatchingModeEnum.Identifier)}
                    </option>
                    <option
                        value=${UserMatchingModeEnum.EmailLink}
                        ?selected=${this.instance?.userMatchingMode ===
                        UserMatchingModeEnum.EmailLink}
                    >
                        ${UserMatchingModeToLabel(UserMatchingModeEnum.EmailLink)}
                    </option>
                    <option
                        value=${UserMatchingModeEnum.EmailDeny}
                        ?selected=${this.instance?.userMatchingMode ===
                        UserMatchingModeEnum.EmailDeny}
                    >
                        ${UserMatchingModeToLabel(UserMatchingModeEnum.EmailDeny)}
                    </option>
                    <option
                        value=${UserMatchingModeEnum.UsernameLink}
                        ?selected=${this.instance?.userMatchingMode ===
                        UserMatchingModeEnum.UsernameLink}
                    >
                        ${UserMatchingModeToLabel(UserMatchingModeEnum.UsernameLink)}
                    </option>
                    <option
                        value=${UserMatchingModeEnum.UsernameDeny}
                        ?selected=${this.instance?.userMatchingMode ===
                        UserMatchingModeEnum.UsernameDeny}
                    >
                        ${UserMatchingModeToLabel(UserMatchingModeEnum.UsernameDeny)}
                    </option>
                </select>
            </ak-form-element-horizontal>
            <ak-form-element-horizontal
                label=${msg("Group matching mode")}
                required
                name="groupMatchingMode"
            >
                <select class="pf-c-form-control">
                    <option
                        value=${GroupMatchingModeEnum.Identifier}
                        ?selected=${this.instance?.groupMatchingMode ===
                        GroupMatchingModeEnum.Identifier}
                    >
                        ${UserMatchingModeToLabel(UserMatchingModeEnum.Identifier)}
                    </option>
                    <option
                        value=${GroupMatchingModeEnum.NameLink}
                        ?selected=${this.instance?.groupMatchingMode ===
                        GroupMatchingModeEnum.NameLink}
                    >
                        ${GroupMatchingModeToLabel(GroupMatchingModeEnum.NameLink)}
                    </option>
                    <option
                        value=${GroupMatchingModeEnum.NameDeny}
                        ?selected=${this.instance?.groupMatchingMode ===
                        GroupMatchingModeEnum.NameDeny}
                    >
                        ${GroupMatchingModeToLabel(GroupMatchingModeEnum.NameDeny)}
                    </option>
                </select>
            </ak-form-element-horizontal>
            <ak-form-element-horizontal label=${msg("User path")} name="userPathTemplate">
                <input
                    type="text"
                    value="${this.instance?.userPathTemplate ?? "goauthentik.io/sources/%(slug)s"}"
                    class="pf-c-form-control"
                />
                <p class="pf-c-form__helper-text">${placeholderHelperText}</p>
            </ak-form-element-horizontal>
            ${this.can(CapabilitiesEnum.CanSaveMedia)
                ? html`<ak-form-element-horizontal label=${msg("Icon")} name="icon">
                          <input type="file" value="" class="pf-c-form-control" />
                          ${this.instance?.icon
                              ? html`
                                    <p class="pf-c-form__helper-text">
                                        ${msg("Currently set to:")} ${this.instance?.icon}
                                    </p>
                                `
                              : html``}
                      </ak-form-element-horizontal>
                      ${this.instance?.icon
                          ? html`
                                <ak-form-element-horizontal>
                                    <label class="pf-c-switch">
                                        <input
                                            class="pf-c-switch__input"
                                            type="checkbox"
                                            @change=${(ev: Event) => {
                                                const target = ev.target as HTMLInputElement;
                                                this.clearIcon = target.checked;
                                            }}
                                        />
                                        <span class="pf-c-switch__toggle">
                                            <span class="pf-c-switch__toggle-icon">
                                                <i class="fas fa-check" aria-hidden="true"></i>
                                            </span>
                                        </span>
                                        <span class="pf-c-switch__label">
                                            ${msg("Clear icon")}
                                        </span>
                                    </label>
                                    <p class="pf-c-form__helper-text">
                                        ${msg("Delete currently set icon.")}
                                    </p>
                                </ak-form-element-horizontal>
                            `
                          : html``}`
                : html`<ak-form-element-horizontal label=${msg("Icon")} name="icon">
                      <input
                          type="text"
                          value="${this.instance?.icon ?? ""}"
                          class="pf-c-form-control"
                      />
                      <p class="pf-c-form__helper-text">${iconHelperText}</p>
                  </ak-form-element-horizontal>`}
            <ak-form-group open label="${msg("Protocol settings")}">
                <div class="pf-c-form">
                    <ak-form-element-horizontal label=${msg("Client ID")} required name="clientId">
                        <input
                            type="text"
                            value="${this.instance?.clientId ?? ""}"
                            class="pf-c-form-control"
                            required
                        />
                    </ak-form-element-horizontal>
                    ${this.renderSettings()}
                </div>
            </ak-form-group>
            <ak-form-group label="${msg("Flow settings")}">
                <div class="pf-c-form">
                    <ak-form-element-horizontal
                        label=${msg("Authentication flow")}
                        name="authenticationFlow"
                    >
                        <ak-source-flow-search
                            flowType=${FlowsInstancesListDesignationEnum.Authentication}
                            .currentFlow=${this.instance?.authenticationFlow}
                            .instanceId=${this.instance?.pk}
                            fallback="default-source-authentication"
                        ></ak-source-flow-search>
                        <p class="pf-c-form__helper-text">
                            ${msg("Flow to use when authenticating existing users.")}
                        </p>
                    </ak-form-element-horizontal>
                    <ak-form-element-horizontal
                        label=${msg("Enrollment flow")}
                        name="enrollmentFlow"
                    >
                        <ak-source-flow-search
                            flowType=${FlowsInstancesListDesignationEnum.Enrollment}
                            .currentFlow=${this.instance?.enrollmentFlow}
                            .instanceId=${this.instance?.pk}
                            fallback="default-source-enrollment"
                        ></ak-source-flow-search>
                        <p class="pf-c-form__helper-text">
                            ${msg("Flow to use when enrolling new users.")}
                        </p>
                    </ak-form-element-horizontal>
                </div>
            </ak-form-group>
            <ak-form-group open label="${msg("Plex Attribute mapping")}">
                <div class="pf-c-form">
                    <ak-form-element-horizontal
                        label=${msg("User Property Mappings")}
                        name="userPropertyMappings"
                    >
                        <ak-dual-select-dynamic-selected
                            .provider=${propertyMappingsProvider}
                            .selector=${propertyMappingsSelector(
                                this.instance?.userPropertyMappings,
                            )}
                            available-label="${msg("Available User Property Mappings")}"
                            selected-label="${msg("Selected User Property Mappings")}"
                        ></ak-dual-select-dynamic-selected>
                        <p class="pf-c-form__helper-text">
                            ${msg("Property mappings for user creation.")}
                        </p>
                    </ak-form-element-horizontal>
                    <ak-form-element-horizontal
                        label=${msg("Group Property Mappings")}
                        name="groupPropertyMappings"
                    >
                        <ak-dual-select-dynamic-selected
                            .provider=${propertyMappingsProvider}
                            .selector=${propertyMappingsSelector(
                                this.instance?.groupPropertyMappings,
                            )}
                            available-label="${msg("Available Group Property Mappings")}"
                            selected-label="${msg("Selected Group Property Mappings")}"
                        ></ak-dual-select-dynamic-selected>
                        <p class="pf-c-form__helper-text">
                            ${msg("Property mappings for group creation.")}
                        </p>
                    </ak-form-element-horizontal>
                </div>
            </ak-form-group>
            <ak-form-group>
                <span slot="header"> ${msg("Advanced settings")} </span>
                <div slot="body" class="pf-c-form">
                    <ak-form-element-horizontal
                        label=${msg("Policy engine mode")}
                        required
                        name="policyEngineMode"
                    >
                        <ak-radio
                            .options=${policyEngineModes}
                            .value=${this.instance?.policyEngineMode}
                        >
                        </ak-radio>
                    </ak-form-element-horizontal>
                </div>
            </ak-form-group>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-source-plex-form": PlexSourceForm;
    }
}
