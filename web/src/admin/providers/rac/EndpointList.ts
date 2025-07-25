import "#admin/policies/BoundPoliciesList";
import "#admin/providers/rac/EndpointForm";
import "#admin/rbac/ObjectPermissionModal";
import "#elements/buttons/SpinnerButton/index";
import "#elements/forms/DeleteBulkForm";
import "#elements/forms/ModalForm";
import "@patternfly/elements/pf-tooltip/pf-tooltip.js";

import { DEFAULT_CONFIG } from "#common/api/config";

import { PaginatedResponse, Table, TableColumn } from "#elements/table/Table";

import {
    Endpoint,
    RacApi,
    RACProvider,
    RbacPermissionsAssignedByUsersListModelEnum,
} from "@goauthentik/api";

import { msg } from "@lit/localize";
import { CSSResult, html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import PFDescriptionList from "@patternfly/patternfly/components/DescriptionList/description-list.css";

@customElement("ak-rac-endpoint-list")
export class EndpointListPage extends Table<Endpoint> {
    expandable = true;
    checkbox = true;
    clearOnRefresh = true;

    searchEnabled(): boolean {
        return true;
    }

    @property()
    order = "name";

    @property({ attribute: false })
    provider?: RACProvider;

    static styles: CSSResult[] = [...super.styles, PFDescriptionList];

    async apiEndpoint(): Promise<PaginatedResponse<Endpoint>> {
        return new RacApi(DEFAULT_CONFIG).racEndpointsList({
            ...(await this.defaultEndpointConfig()),
            provider: this.provider?.pk,
            superuserFullList: true,
        });
    }

    columns(): TableColumn[] {
        return [
            new TableColumn(msg("Name"), "name"),
            new TableColumn(msg("Host"), "host"),
            new TableColumn(msg("Actions")),
        ];
    }

    renderToolbarSelected(): TemplateResult {
        const disabled = this.selectedElements.length < 1;
        return html`<ak-forms-delete-bulk
            objectLabel=${msg("Endpoint(s)")}
            .objects=${this.selectedElements}
            .metadata=${(item: Endpoint) => {
                return [
                    { key: msg("Name"), value: item.name },
                    { key: msg("Host"), value: item.host },
                ];
            }}
            .usedBy=${(item: Endpoint) => {
                return new RacApi(DEFAULT_CONFIG).racEndpointsUsedByList({
                    pbmUuid: item.pk,
                });
            }}
            .delete=${(item: Endpoint) => {
                return new RacApi(DEFAULT_CONFIG).racEndpointsDestroy({
                    pbmUuid: item.pk,
                });
            }}
        >
            <button ?disabled=${disabled} slot="trigger" class="pf-c-button pf-m-danger">
                ${msg("Delete")}
            </button>
        </ak-forms-delete-bulk>`;
    }

    row(item: Endpoint): TemplateResult[] {
        return [
            html`${item.name}`,
            html`${item.host}`,
            html`<ak-forms-modal>
                    <span slot="submit"> ${msg("Update")} </span>
                    <span slot="header"> ${msg("Update Endpoint")} </span>
                    <ak-rac-endpoint-form slot="form" .instancePk=${item.pk}>
                    </ak-rac-endpoint-form>
                    <button slot="trigger" class="pf-c-button pf-m-plain">
                        <pf-tooltip position="top" content=${msg("Edit")}>
                            <i class="fas fa-edit"></i>
                        </pf-tooltip>
                    </button>
                </ak-forms-modal>
                <ak-rbac-object-permission-modal
                    model=${RbacPermissionsAssignedByUsersListModelEnum.AuthentikProvidersRacEndpoint}
                    objectPk=${item.pk}
                >
                </ak-rbac-object-permission-modal>`,
        ];
    }

    renderExpanded(item: Endpoint): TemplateResult {
        return html` <td></td>
            <td role="cell" colspan="4">
                <div class="pf-c-table__expandable-row-content">
                    <div class="pf-c-content">
                        <p>
                            ${msg(
                                "These bindings control which users will have access to this endpoint. Users must also have access to the application.",
                            )}
                        </p>
                        <ak-bound-policies-list .target=${item.pk}> </ak-bound-policies-list>
                    </div>
                </div>
            </td>`;
    }

    renderObjectCreate(): TemplateResult {
        return html`
            <ak-forms-modal>
                <span slot="submit"> ${msg("Create")} </span>
                <span slot="header"> ${msg("Create Endpoint")} </span>
                <ak-rac-endpoint-form slot="form" .providerID=${this.provider?.pk}>
                </ak-rac-endpoint-form>
                <button slot="trigger" class="pf-c-button pf-m-primary">${msg("Create")}</button>
            </ak-forms-modal>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-rac-endpoint-list": EndpointListPage;
    }
}
