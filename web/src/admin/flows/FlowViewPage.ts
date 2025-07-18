import "#admin/flows/BoundStagesList";
import "#admin/flows/FlowDiagram";
import "#admin/flows/FlowForm";
import "#admin/policies/BoundPoliciesList";
import "#admin/rbac/ObjectPermissionsPage";
import "#components/ak-page-header";
import "#components/events/ObjectChangelog";
import "#elements/Tabs";
import "#elements/buttons/SpinnerButton/ak-spinner-button";

import { AndNext, DEFAULT_CONFIG } from "#common/api/config";
import { isResponseErrorLike } from "#common/errors/network";

import { AKElement } from "#elements/Base";

import { DesignationToLabel } from "#admin/flows/utils";

import { Flow, FlowsApi, RbacPermissionsAssignedByUsersListModelEnum } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { css, CSSResult, html, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import PFButton from "@patternfly/patternfly/components/Button/button.css";
import PFCard from "@patternfly/patternfly/components/Card/card.css";
import PFContent from "@patternfly/patternfly/components/Content/content.css";
import PFDescriptionList from "@patternfly/patternfly/components/DescriptionList/description-list.css";
import PFPage from "@patternfly/patternfly/components/Page/page.css";
import PFGrid from "@patternfly/patternfly/layouts/Grid/grid.css";
import PFBase from "@patternfly/patternfly/patternfly-base.css";

@customElement("ak-flow-view")
export class FlowViewPage extends AKElement {
    @property({ type: String })
    flowSlug?: string;

    @state()
    flow!: Flow;

    static styles: CSSResult[] = [
        PFBase,
        PFPage,
        PFDescriptionList,
        PFButton,
        PFCard,
        PFContent,
        PFGrid,
        css`
            img.pf-icon {
                max-height: 24px;
            }
            ak-tabs {
                height: 100%;
            }
        `,
    ];

    fetchFlow(slug: string) {
        new FlowsApi(DEFAULT_CONFIG).flowsInstancesRetrieve({ slug }).then((flow) => {
            this.flow = flow;
        });
    }

    willUpdate(changedProperties: PropertyValues<this>) {
        if (changedProperties.has("flowSlug") && this.flowSlug) {
            this.fetchFlow(this.flowSlug);
        }
    }

    render(): TemplateResult {
        if (!this.flow) {
            return html``;
        }
        return html`<ak-page-header
                icon="pf-icon pf-icon-process-automation"
                header=${this.flow.name}
                description=${this.flow.title}
            >
            </ak-page-header>
            <ak-tabs>
                <div
                    slot="page-overview"
                    data-tab-title="${msg("Flow Overview")}"
                    class="pf-c-page__main-section pf-m-no-padding-mobile"
                >
                    <div class="pf-l-grid pf-m-gutter">
                        <div
                            class="pf-c-card pf-l-grid__item pf-m-12-col pf-m-2-col-on-xl pf-m-2-col-on-2xl"
                        >
                            <div class="pf-c-card__title">${msg("Flow Info")}</div>
                            <div class="pf-c-card__body">
                                <dl class="pf-c-description-list">
                                    <div class="pf-c-description-list__group">
                                        <dt class="pf-c-description-list__term">
                                            <span class="pf-c-description-list__text"
                                                >${msg("Name")}</span
                                            >
                                        </dt>
                                        <dd class="pf-c-description-list__description">
                                            <div class="pf-c-description-list__text">
                                                ${this.flow.name}
                                            </div>
                                        </dd>
                                        <dt class="pf-c-description-list__term">
                                            <span class="pf-c-description-list__text"
                                                >${msg("Slug")}</span
                                            >
                                        </dt>
                                        <dd class="pf-c-description-list__description">
                                            <div class="pf-c-description-list__text">
                                                <code>${this.flow.slug}</code>
                                            </div>
                                        </dd>
                                        <dt class="pf-c-description-list__term">
                                            <span class="pf-c-description-list__text"
                                                >${msg("Designation")}</span
                                            >
                                        </dt>
                                        <dd class="pf-c-description-list__description">
                                            <div class="pf-c-description-list__text">
                                                ${DesignationToLabel(this.flow.designation)}
                                            </div>
                                        </dd>
                                        <dt class="pf-c-description-list__term">
                                            <span class="pf-c-description-list__text"
                                                >${msg("Related actions")}</span
                                            >
                                        </dt>
                                        <dd class="pf-c-description-list__description">
                                            <div class="pf-c-description-list__text">
                                                <ak-forms-modal>
                                                    <span slot="submit"> ${msg("Update")} </span>
                                                    <span slot="header">
                                                        ${msg("Update Flow")}
                                                    </span>
                                                    <ak-flow-form
                                                        slot="form"
                                                        .instancePk=${this.flow.slug}
                                                    >
                                                    </ak-flow-form>
                                                    <button
                                                        slot="trigger"
                                                        class="pf-c-button pf-m-block pf-m-secondary"
                                                    >
                                                        ${msg("Edit")}
                                                    </button>
                                                </ak-forms-modal>
                                            </div>
                                        </dd>
                                        <dt class="pf-c-description-list__term">
                                            <span class="pf-c-description-list__text"
                                                >${msg("Execute flow")}</span
                                            >
                                        </dt>
                                        <dd class="pf-c-description-list__description">
                                            <div class="pf-c-description-list__text">
                                                <button
                                                    class="pf-c-button pf-m-block pf-m-primary"
                                                    @click=${() => {
                                                        const finalURL = `${
                                                            window.location.origin
                                                        }/if/flow/${this.flow.slug}/${AndNext(
                                                            `${window.location.pathname}#${window.location.hash}`,
                                                        )}`;
                                                        window.open(finalURL, "_blank");
                                                    }}
                                                >
                                                    ${msg("Normal")}
                                                </button>
                                                <button
                                                    class="pf-c-button pf-m-block pf-m-secondary"
                                                    @click=${() => {
                                                        new FlowsApi(DEFAULT_CONFIG)
                                                            .flowsInstancesExecuteRetrieve({
                                                                slug: this.flow.slug,
                                                            })
                                                            .then((link) => {
                                                                const finalURL = `${
                                                                    link.link
                                                                }${AndNext(
                                                                    `${window.location.pathname}#${window.location.hash}`,
                                                                )}`;
                                                                window.open(finalURL, "_blank");
                                                            });
                                                    }}
                                                >
                                                    ${msg("with current user")}
                                                </button>
                                                <button
                                                    class="pf-c-button pf-m-block pf-m-secondary"
                                                    @click=${() => {
                                                        new FlowsApi(DEFAULT_CONFIG)
                                                            .flowsInstancesExecuteRetrieve({
                                                                slug: this.flow.slug,
                                                            })
                                                            .then((link) => {
                                                                const finalURL = `${
                                                                    link.link
                                                                }?${encodeURI(
                                                                    `inspector=open&next=/#${window.location.hash}`,
                                                                )}`;
                                                                window.open(finalURL, "_blank");
                                                            })
                                                            .catch(async (error: unknown) => {
                                                                if (isResponseErrorLike(error)) {
                                                                    // This request can return a HTTP 400 when a flow
                                                                    // is not applicable.
                                                                    window.open(
                                                                        error.response.url,
                                                                        "_blank",
                                                                    );
                                                                }
                                                            });
                                                    }}
                                                >
                                                    ${msg("with inspector")}
                                                </button>
                                            </div>
                                        </dd>
                                        <dt class="pf-c-description-list__term">
                                            <span class="pf-c-description-list__text"
                                                >${msg("Export flow")}</span
                                            >
                                        </dt>
                                        <dd class="pf-c-description-list__description">
                                            <div class="pf-c-description-list__text">
                                                <a
                                                    class="pf-c-button pf-m-block pf-m-secondary"
                                                    href=${this.flow.exportUrl}
                                                >
                                                    ${msg("Export")}
                                                </a>
                                            </div>
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                        <div
                            class="pf-c-card pf-l-grid__item pf-m-12-col pf-m-10-col-on-xl pf-m-10-col-on-2xl"
                        >
                            <div class="pf-c-card__title">${msg("Diagram")}</div>
                            <div class="pf-c-card__body">
                                <ak-flow-diagram flowSlug=${this.flow.slug}> </ak-flow-diagram>
                            </div>
                        </div>
                        <div
                            class="pf-c-card pf-l-grid__item pf-m-12-col pf-m-12-col-on-xl pf-m-12-col-on-2xl"
                        >
                            <div class="pf-c-card__title">${msg("Changelog")}</div>
                            <div class="pf-c-card__body">
                                <ak-object-changelog
                                    targetModelPk=${this.flow.pk || ""}
                                    targetModelApp="authentik_flows"
                                    targetModelName="flow"
                                >
                                </ak-object-changelog>
                            </div>
                        </div>
                    </div>
                </div>
                <div
                    slot="page-stage-bindings"
                    data-tab-title="${msg("Stage Bindings")}"
                    class="pf-c-page__main-section pf-m-no-padding-mobile"
                >
                    <div class="pf-c-card">
                        <div class="pf-c-card__body">
                            <ak-bound-stages-list .target=${this.flow.pk}> </ak-bound-stages-list>
                        </div>
                    </div>
                </div>
                <div
                    slot="page-policy-bindings"
                    data-tab-title="${msg("Policy / Group / User Bindings")}"
                    class="pf-c-page__main-section pf-m-no-padding-mobile"
                >
                    <div class="pf-c-card">
                        <div class="pf-c-card__title">
                            ${msg("These bindings control which users can access this flow.")}
                        </div>
                        <div class="pf-c-card__body">
                            <ak-bound-policies-list
                                .target=${this.flow.policybindingmodelPtrId}
                                .policyEngineMode=${this.flow.policyEngineMode}
                            >
                            </ak-bound-policies-list>
                        </div>
                    </div>
                </div>
                <ak-rbac-object-permission-page
                    slot="page-permissions"
                    data-tab-title="${msg("Permissions")}"
                    model=${RbacPermissionsAssignedByUsersListModelEnum.AuthentikFlowsFlow}
                    objectPk=${this.flow.pk}
                ></ak-rbac-object-permission-page>
            </ak-tabs>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-flow-view": FlowViewPage;
    }
}
