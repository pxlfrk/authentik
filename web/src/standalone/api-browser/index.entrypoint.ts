// sort-imports-ignore
import "rapidoc";
import "#elements/ak-locale-context/index";

import { CSRFHeaderName } from "#common/api/middleware";
import { EVENT_THEME_CHANGE } from "#common/constants";
import { getCookie } from "#common/utils";

import { Interface } from "#elements/Interface";
import { WithBrandConfig } from "#elements/mixins/branding";
import { themeImage } from "#elements/utils/images";

import { UiThemeEnum } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { css, CSSResult, html, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

@customElement("ak-api-browser")
export class APIBrowser extends WithBrandConfig(Interface) {
    @property()
    schemaPath?: string;

    static styles: CSSResult[] = [
        css`
            img.logo {
                width: 100%;
                padding: 1rem 0.5rem 1.5rem 0.5rem;
                min-height: 48px;
            }
        `,
    ];

    @state()
    bgColor = "#000000";

    @state()
    textColor = "#000000";

    firstUpdated(): void {
        this.addEventListener(EVENT_THEME_CHANGE, ((ev: CustomEvent<UiThemeEnum>) => {
            const style = getComputedStyle(document.documentElement);
            if (ev.detail === UiThemeEnum.Light) {
                this.bgColor = style
                    .getPropertyValue("--pf-global--BackgroundColor--light-300")
                    .trim();
                this.textColor = style.getPropertyValue("--pf-global--Color--300").trim();
            } else {
                this.bgColor = style.getPropertyValue("--ak-dark-background").trim();
                this.textColor = style.getPropertyValue("--ak-dark-foreground").trim();
            }
        }) as EventListener);
        this.dispatchEvent(
            new CustomEvent(EVENT_THEME_CHANGE, {
                bubbles: true,
                composed: true,
                detail: UiThemeEnum.Automatic,
            }),
        );
    }

    render(): TemplateResult {
        return html`
            <ak-locale-context>
                <rapi-doc
                    spec-url=${ifDefined(this.schemaPath)}
                    heading-text=""
                    theme="light"
                    render-style="read"
                    default-schema-tab="schema"
                    primary-color="#fd4b2d"
                    nav-bg-color="#212427"
                    bg-color=${this.bgColor}
                    text-color=${this.textColor}
                    nav-text-color="#ffffff"
                    nav-hover-bg-color="#3c3f42"
                    nav-accent-color="#4f5255"
                    nav-hover-text-color="#ffffff"
                    use-path-in-nav-bar="true"
                    nav-item-spacing="relaxed"
                    allow-server-selection="false"
                    show-header="false"
                    allow-spec-url-load="false"
                    allow-spec-file-load="false"
                    show-method-in-nav-bar="as-colored-text"
                    @before-try=${(
                        e: CustomEvent<{
                            request: {
                                headers: Headers;
                            };
                        }>,
                    ) => {
                        e.detail.request.headers.append(
                            CSRFHeaderName,
                            getCookie("authentik_csrf"),
                        );
                    }}
                >
                    <div slot="nav-logo">
                        <img
                            alt="${msg("authentik Logo")}"
                            class="logo"
                            src="${themeImage(this.brandingLogo)}"
                        />
                    </div>
                </rapi-doc>
            </ak-locale-context>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-api-browser": APIBrowser;
    }
}
