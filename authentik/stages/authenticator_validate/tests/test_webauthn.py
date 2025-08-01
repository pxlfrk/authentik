"""Test validator stage"""

from time import sleep

from django.test.client import RequestFactory
from django.urls.base import reverse
from rest_framework.serializers import ValidationError
from webauthn.helpers.base64url_to_bytes import base64url_to_bytes
from webauthn.helpers.bytes_to_base64url import bytes_to_base64url

from authentik.core.tests.utils import create_test_admin_user, create_test_flow
from authentik.flows.models import FlowStageBinding, NotConfiguredAction
from authentik.flows.planner import PLAN_CONTEXT_PENDING_USER, FlowPlan
from authentik.flows.stage import StageView
from authentik.flows.tests import FlowTestCase
from authentik.flows.views.executor import SESSION_KEY_PLAN, FlowExecutorView
from authentik.lib.generators import generate_id
from authentik.lib.tests.utils import get_request
from authentik.stages.authenticator_validate.challenge import (
    get_challenge_for_device,
    get_webauthn_challenge_without_user,
    validate_challenge_webauthn,
)
from authentik.stages.authenticator_validate.models import AuthenticatorValidateStage, DeviceClasses
from authentik.stages.authenticator_validate.stage import (
    PLAN_CONTEXT_DEVICE_CHALLENGES,
    AuthenticatorValidateStageView,
)
from authentik.stages.authenticator_webauthn.models import (
    UserVerification,
    WebAuthnDevice,
    WebAuthnDeviceType,
)
from authentik.stages.authenticator_webauthn.stage import PLAN_CONTEXT_WEBAUTHN_CHALLENGE
from authentik.stages.authenticator_webauthn.tasks import webauthn_mds_import
from authentik.stages.identification.models import IdentificationStage, UserFields
from authentik.stages.user_login.models import UserLoginStage


class AuthenticatorValidateStageWebAuthnTests(FlowTestCase):
    """Test validator stage"""

    def setUp(self) -> None:
        self.user = create_test_admin_user()
        self.request_factory = RequestFactory()

    def test_last_auth_threshold(self):
        """Test last_auth_threshold"""
        ident_stage = IdentificationStage.objects.create(
            name=generate_id(),
            user_fields=[
                UserFields.USERNAME,
            ],
        )
        device: WebAuthnDevice = WebAuthnDevice.objects.create(
            user=self.user,
            confirmed=True,
        )
        device.set_sign_count(device.sign_count + 1)
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            last_auth_threshold="milliseconds=0",
            not_configured_action=NotConfiguredAction.CONFIGURE,
            device_classes=[DeviceClasses.WEBAUTHN],
        )
        sleep(1)
        stage.configuration_stages.set([ident_stage])
        flow = create_test_flow()
        FlowStageBinding.objects.create(target=flow, stage=ident_stage, order=0)
        FlowStageBinding.objects.create(target=flow, stage=stage, order=1)

        response = self.client.post(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
            {"uid_field": self.user.username},
        )
        self.assertEqual(response.status_code, 302)
        response = self.client.get(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
            follow=True,
        )
        self.assertStageResponse(
            response,
            flow,
            component="ak-stage-authenticator-validate",
        )

    def test_device_challenge_webauthn(self):
        """Test webauthn"""
        request = get_request("/")
        request.user = self.user

        webauthn_device = WebAuthnDevice.objects.create(
            user=self.user,
            public_key=bytes_to_base64url(b"qwerqwerqre"),
            credential_id=bytes_to_base64url(b"foobarbaz"),
            sign_count=0,
            rp_id=generate_id(),
        )
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            last_auth_threshold="milliseconds=0",
            not_configured_action=NotConfiguredAction.CONFIGURE,
            device_classes=[DeviceClasses.WEBAUTHN],
            webauthn_user_verification=UserVerification.PREFERRED,
        )
        plan = FlowPlan("")
        stage_view = AuthenticatorValidateStageView(
            FlowExecutorView(flow=None, current_stage=stage, plan=plan), request=request
        )
        challenge = get_challenge_for_device(stage_view, stage, webauthn_device)
        del challenge["challenge"]
        self.assertEqual(
            challenge,
            {
                "allowCredentials": [
                    {
                        "id": "Zm9vYmFyYmF6",
                        "type": "public-key",
                    }
                ],
                "rpId": "testserver",
                "timeout": 60000,
                "userVerification": "preferred",
            },
        )

        with self.assertRaises(ValidationError):
            validate_challenge_webauthn(
                {},
                StageView(FlowExecutorView(current_stage=stage, plan=plan), request=request),
                self.user,
            )

    def test_device_challenge_webauthn_restricted(self):
        """Test webauthn (getting device challenges with a webauthn
        device that is not allowed due to aaguid restrictions)"""
        webauthn_mds_import.send(force=True).get_result()
        request = get_request("/")
        request.user = self.user

        WebAuthnDevice.objects.create(
            user=self.user,
            public_key=bytes_to_base64url(b"qwerqwerqre"),
            credential_id=bytes_to_base64url(b"foobarbaz"),
            sign_count=0,
            rp_id=generate_id(),
            device_type=WebAuthnDeviceType.objects.get(
                aaguid="2fc0579f-8113-47ea-b116-bb5a8db9202a"
            ),
        )
        flow = create_test_flow()
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            last_auth_threshold="milliseconds=0",
            not_configured_action=NotConfiguredAction.DENY,
            device_classes=[DeviceClasses.WEBAUTHN],
            webauthn_user_verification=UserVerification.PREFERRED,
        )
        stage.webauthn_allowed_device_types.set(
            WebAuthnDeviceType.objects.filter(description="YubiKey 5 Series")
        )
        session = self.client.session
        plan = FlowPlan(flow_pk=flow.pk.hex)
        plan.append_stage(stage)
        plan.append_stage(UserLoginStage.objects.create(name=generate_id()))
        plan.context[PLAN_CONTEXT_PENDING_USER] = self.user
        session[SESSION_KEY_PLAN] = plan
        session.save()

        response = self.client.get(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
        )
        self.assertStageResponse(
            response,
            flow,
            component="ak-stage-access-denied",
            error_message="No (allowed) MFA authenticator configured.",
        )

    def test_raw_get_challenge(self):
        """Test webauthn"""
        request = get_request("/")
        request.user = self.user

        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            last_auth_threshold="milliseconds=0",
            not_configured_action=NotConfiguredAction.CONFIGURE,
            device_classes=[DeviceClasses.WEBAUTHN],
            webauthn_user_verification=UserVerification.PREFERRED,
        )
        webauthn_device = WebAuthnDevice.objects.create(
            user=self.user,
            public_key=(
                "pQECAyYgASFYIGsBLkklToCQkT7qJT_bJYN1sEc1oJdbnmoOc43i0J"
                "H6IlggLTXytuhzFVYYAK4PQNj8_coGrbbzSfUxdiPAcZTQCyU"
            ),
            credential_id="QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
            sign_count=0,
            rp_id=generate_id(),
        )
        plan = FlowPlan("")
        plan.context[PLAN_CONTEXT_WEBAUTHN_CHALLENGE] = base64url_to_bytes(
            "g98I51mQvZXo5lxLfhrD2zfolhZbLRyCgqkkYap1jwSaJ13BguoJWCF9_Lg3AgO4Wh-Bqa556JE20oKsYbl6RA"
        )
        stage_view = AuthenticatorValidateStageView(
            FlowExecutorView(flow=None, current_stage=stage, plan=plan), request=request
        )
        challenge = get_challenge_for_device(stage_view, stage, webauthn_device)
        self.assertEqual(
            challenge["allowCredentials"],
            [
                {
                    "id": "QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
                    "type": "public-key",
                }
            ],
        )
        self.assertIsNotNone(challenge["challenge"])
        self.assertEqual(
            challenge["rpId"],
            "testserver",
        )
        self.assertEqual(
            challenge["timeout"],
            60000,
        )
        self.assertEqual(
            challenge["userVerification"],
            "preferred",
        )

    def test_get_challenge_userless(self):
        """Test webauthn (userless)"""
        request = get_request("/")
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(), webauthn_user_verification=UserVerification.PREFERRED
        )
        stage.refresh_from_db()
        WebAuthnDevice.objects.create(
            user=self.user,
            public_key=(
                "pQECAyYgASFYIGsBLkklToCQkT7qJT_bJYN1sEc1oJdbnmoOc43i0J"
                "H6IlggLTXytuhzFVYYAK4PQNj8_coGrbbzSfUxdiPAcZTQCyU"
            ),
            credential_id="QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
            sign_count=0,
            rp_id=generate_id(),
        )
        plan = FlowPlan("")
        stage_view = AuthenticatorValidateStageView(
            FlowExecutorView(flow=None, current_stage=stage, plan=plan), request=request
        )
        challenge = get_webauthn_challenge_without_user(stage_view, stage)
        self.assertEqual(challenge["allowCredentials"], [])
        self.assertIsNotNone(challenge["challenge"])
        self.assertEqual(challenge["rpId"], "testserver")
        self.assertEqual(challenge["timeout"], 60000)
        self.assertEqual(challenge["userVerification"], "preferred")

    def test_validate_challenge_unrestricted(self):
        """Test webauthn authentication (unrestricted webauthn device)"""
        webauthn_mds_import.send(force=True).get_result()
        device = WebAuthnDevice.objects.create(
            user=self.user,
            public_key=(
                "pQECAyYgASFYIF-N4GvQJdTJMAmTOxFX9_boL00zBiSrP0DY9xvJl_FFIlggnyZloVSVofdJNTLMeMdjQHgW2Rzmd5_Xt5AWtNztcdo"
            ),
            credential_id="X43ga9Al1MkwCZM7EXD1r8Sxj7aXnNsuR013XM7he4kZ-GS9TaA-u3i36wsswjPm",
            sign_count=2,
            rp_id=generate_id(),
            device_type=WebAuthnDeviceType.objects.get(
                aaguid="2fc0579f-8113-47ea-b116-bb5a8db9202a"
            ),
        )
        flow = create_test_flow()
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            not_configured_action=NotConfiguredAction.CONFIGURE,
            device_classes=[DeviceClasses.WEBAUTHN],
        )
        session = self.client.session
        plan = FlowPlan(flow_pk=flow.pk.hex)
        plan.append_stage(stage)
        plan.append_stage(UserLoginStage.objects.create(name=generate_id()))
        plan.context[PLAN_CONTEXT_PENDING_USER] = self.user
        plan.context[PLAN_CONTEXT_DEVICE_CHALLENGES] = [
            {
                "device_class": device.__class__.__name__.lower().replace("device", ""),
                "device_uid": device.pk,
                "challenge": {},
                "last_used": None,
            }
        ]
        plan.context[PLAN_CONTEXT_WEBAUTHN_CHALLENGE] = base64url_to_bytes(
            "aCC6ak_DP45xMH1qyxzUM5iC2xc4QthQb09v7m4qDBmY8FvWvhxFzSuFlDYQmclrh5fWS5q0TPxgJGF4vimcFQ"
        )
        session[SESSION_KEY_PLAN] = plan
        session.save()

        response = self.client.post(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
            data={
                "webauthn": {
                    "id": "X43ga9Al1MkwCZM7EXD1r8Sxj7aXnNsuR013XM7he4kZ-GS9TaA-u3i36wsswjPm",
                    "rawId": "X43ga9Al1MkwCZM7EXD1r8Sxj7aXnNsuR013XM7he4kZ-GS9TaA-u3i36wsswjPm",
                    "type": "public-key",
                    "assertionClientExtensions": "{}",
                    "response": {
                        "clientDataJSON": (
                            "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiYUNDN"
                            "mFrX0RQNDV4TUgxcXl4elVNNWlDMnhjNFF0aFFiMDl2N200cURCbV"
                            "k4RnZXdmh4RnpTdUZsRFlRbWNscmg1ZldTNXEwVFB4Z0pHRjR2aW1"
                            "jRlEiLCJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjkwMDAiLCJj"
                            "cm9zc09yaWdpbiI6ZmFsc2V9"
                        ),
                        "signature": (
                            "MEQCIAHQCGfE_PX1z6mBDaXUNqK_NrllhXylNOmETUD3Khv9AiBTl"
                            "rX3GDRj5OaOfTToOwUwAhtd74tu0T6DZAVHPb_hlQ=="
                        ),
                        "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAABg==",
                        "userHandle": None,
                    },
                },
            },
            SERVER_NAME="localhost",
            SERVER_PORT="9000",
        )
        self.assertEqual(response.status_code, 302)
        response = self.client.get(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
        )
        self.assertStageRedirects(response, reverse("authentik_core:root-redirect"))

    def test_validate_challenge_restricted(self):
        """Test webauthn authentication (restricted device type, failure)"""
        webauthn_mds_import.send(force=True).get_result()
        device = WebAuthnDevice.objects.create(
            user=self.user,
            public_key=(
                "pQECAyYgASFYIF-N4GvQJdTJMAmTOxFX9_boL00zBiSrP0DY9xvJl_FFIlggnyZloVSVofdJNTLMeMdjQHgW2Rzmd5_Xt5AWtNztcdo"
            ),
            credential_id="X43ga9Al1MkwCZM7EXD1r8Sxj7aXnNsuR013XM7he4kZ-GS9TaA-u3i36wsswjPm",
            sign_count=2,
            rp_id=generate_id(),
            device_type=WebAuthnDeviceType.objects.get(
                aaguid="2fc0579f-8113-47ea-b116-bb5a8db9202a"
            ),
        )
        flow = create_test_flow()
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            not_configured_action=NotConfiguredAction.CONFIGURE,
            device_classes=[DeviceClasses.WEBAUTHN],
        )
        stage.webauthn_allowed_device_types.set(
            WebAuthnDeviceType.objects.filter(description="YubiKey 5 Series")
        )
        session = self.client.session
        plan = FlowPlan(flow_pk=flow.pk.hex)
        plan.append_stage(stage)
        plan.append_stage(UserLoginStage.objects.create(name=generate_id()))
        plan.context[PLAN_CONTEXT_PENDING_USER] = self.user
        plan.context[PLAN_CONTEXT_DEVICE_CHALLENGES] = [
            {
                "device_class": device.__class__.__name__.lower().replace("device", ""),
                "device_uid": device.pk,
                "challenge": {},
                "last_used": None,
            }
        ]
        plan.context[PLAN_CONTEXT_WEBAUTHN_CHALLENGE] = base64url_to_bytes(
            "aCC6ak_DP45xMH1qyxzUM5iC2xc4QthQb09v7m4qDBmY8FvWvhxFzSuFlDYQmclrh5fWS5q0TPxgJGF4vimcFQ"
        )
        session[SESSION_KEY_PLAN] = plan
        session.save()

        response = self.client.post(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
            data={
                "webauthn": {
                    "id": "X43ga9Al1MkwCZM7EXD1r8Sxj7aXnNsuR013XM7he4kZ-GS9TaA-u3i36wsswjPm",
                    "rawId": "X43ga9Al1MkwCZM7EXD1r8Sxj7aXnNsuR013XM7he4kZ-GS9TaA-u3i36wsswjPm",
                    "type": "public-key",
                    "assertionClientExtensions": "{}",
                    "response": {
                        "clientDataJSON": (
                            "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiYUNDN"
                            "mFrX0RQNDV4TUgxcXl4elVNNWlDMnhjNFF0aFFiMDl2N200cURCbV"
                            "k4RnZXdmh4RnpTdUZsRFlRbWNscmg1ZldTNXEwVFB4Z0pHRjR2aW1"
                            "jRlEiLCJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjkwMDAiLCJj"
                            "cm9zc09yaWdpbiI6ZmFsc2V9"
                        ),
                        "signature": (
                            "MEQCIAHQCGfE_PX1z6mBDaXUNqK_NrllhXylNOmETUD3Khv9AiBTl"
                            "rX3GDRj5OaOfTToOwUwAhtd74tu0T6DZAVHPb_hlQ=="
                        ),
                        "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAABg==",
                        "userHandle": None,
                    },
                }
            },
            SERVER_NAME="localhost",
            SERVER_PORT="9000",
        )
        self.assertEqual(response.status_code, 200)
        self.assertStageResponse(
            response,
            flow,
            component="ak-stage-authenticator-validate",
            response_errors={
                "webauthn": [
                    {
                        "string": (
                            "Invalid device type. Contact your authentik administrator for help."
                        ),
                        "code": "invalid",
                    }
                ]
            },
        )

    def test_validate_challenge_userless(self):
        """Test webauthn"""
        device = WebAuthnDevice.objects.create(
            user=self.user,
            public_key=(
                "pQECAyYgASFYIGsBLkklToCQkT7qJT_bJYN1sEc1oJdbnmoOc43i0J"
                "H6IlggLTXytuhzFVYYAK4PQNj8_coGrbbzSfUxdiPAcZTQCyU"
            ),
            credential_id="QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
            sign_count=4,
            rp_id=generate_id(),
        )
        flow = create_test_flow()
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            not_configured_action=NotConfiguredAction.CONFIGURE,
            device_classes=[DeviceClasses.WEBAUTHN],
        )
        session = self.client.session
        plan = FlowPlan(flow_pk=flow.pk.hex)
        plan.append_stage(stage)
        plan.append_stage(UserLoginStage.objects.create(name=generate_id()))
        plan.context[PLAN_CONTEXT_DEVICE_CHALLENGES] = [
            {
                "device_class": device.__class__.__name__.lower().replace("device", ""),
                "device_uid": device.pk,
                "challenge": {},
                "last_used": None,
            }
        ]
        plan.context[PLAN_CONTEXT_WEBAUTHN_CHALLENGE] = base64url_to_bytes(
            "g98I51mQvZXo5lxLfhrD2zfolhZbLRyCgqkkYap1jwSaJ13BguoJWCF9_Lg3AgO4Wh-Bqa556JE20oKsYbl6RA"
        )
        session[SESSION_KEY_PLAN] = plan
        session.save()

        response = self.client.post(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
            data={
                "webauthn": {
                    "id": "QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
                    "rawId": "QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
                    "type": "public-key",
                    "assertionClientExtensions": "{}",
                    "response": {
                        "clientDataJSON": (
                            "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiZzk4STUxbVF2Wlhv"
                            "NWx4TGZockQyemZvbGhaYkxSeUNncWtrWWFwMWp3U2FKMTNCZ3VvSldDRjlfTGcz"
                            "QWdPNFdoLUJxYTU1NkpFMjBvS3NZYmw2UkEiLCJvcmlnaW4iOiJodHRwOi8vbG9j"
                            "YWxob3N0OjkwMDAiLCJjcm9zc09yaWdpbiI6ZmFsc2UsIm90aGVyX2tleXNfY2Fu"
                            "X2JlX2FkZGVkX2hlcmUiOiJkbyBub3QgY29tcGFyZSBjbGllbnREYXRhSlNPTiBh"
                            "Z2FpbnN0IGEgdGVtcGxhdGUuIFNlZSBodHRwczovL2dvby5nbC95YWJQZXgifQ=="
                        ),
                        "signature": (
                            "MEQCIFNlrHf9ablJAalXLWkrqvHB8oIu8kwvRpH3X3rbJVpI"
                            "AiAqtOK6mIZPk62kZN0OzFsHfuvu_RlOl7zlqSNzDdz_Ag=="
                        ),
                        "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAABQ==",
                        "userHandle": None,
                    },
                },
            },
            SERVER_NAME="localhost",
            SERVER_PORT="9000",
        )
        self.assertEqual(response.status_code, 302)
        response = self.client.get(
            reverse("authentik_api:flow-executor", kwargs={"flow_slug": flow.slug}),
        )
        self.assertStageRedirects(response, reverse("authentik_core:root-redirect"))

    def test_validate_challenge_invalid(self):
        """Test webauthn"""
        request = get_request("/")
        request.user = self.user

        WebAuthnDevice.objects.create(
            user=self.user,
            public_key=(
                "pQECAyYgASFYIGsBLkklToCQkT7qJT_bJYN1sEc1oJdbnmoOc4"
                "3i0JH6IlggLTXytuhzFVYYAK4PQNj8_coGrbbzSfUxdiPAcZTQCyU"
            ),
            credential_id="QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
            # One more sign count than above, make it invalid
            sign_count=5,
            rp_id=generate_id(),
        )
        flow = create_test_flow()
        stage = AuthenticatorValidateStage.objects.create(
            name=generate_id(),
            not_configured_action=NotConfiguredAction.CONFIGURE,
            device_classes=[DeviceClasses.WEBAUTHN],
        )
        plan = FlowPlan(flow.pk.hex)
        plan.context[PLAN_CONTEXT_WEBAUTHN_CHALLENGE] = base64url_to_bytes(
            "g98I51mQvZXo5lxLfhrD2zfolhZbLRyCgqkkYap1jwSaJ13BguoJWCF9_Lg3AgO4Wh-Bqa556JE20oKsYbl6RA"
        )
        request = get_request("/")

        stage_view = AuthenticatorValidateStageView(
            FlowExecutorView(flow=flow, current_stage=stage, plan=plan), request=request
        )
        request.META["SERVER_NAME"] = "localhost"
        request.META["SERVER_PORT"] = "9000"
        with self.assertRaises(ValidationError):
            validate_challenge_webauthn(
                {
                    "id": "QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
                    "rawId": "QKZ97ASJAOIDyipAs6mKUxDUZgDrWrbAsUb5leL7-oU",
                    "type": "public-key",
                    "assertionClientExtensions": "{}",
                    "response": {
                        "clientDataJSON": (
                            "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiZzk4STUxbVF2WlhvNWx4"
                            "TGZockQyemZvbGhaYkxSeUNncWtrWWFwMWp3U2FKMTNCZ3VvSldDRjlfTGczQWdPNFdo"
                            "LUJxYTU1NkpFMjBvS3NZYmw2UkEiLCJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0Ojkw"
                            "MDAiLCJjcm9zc09yaWdpbiI6ZmFsc2UsIm90aGVyX2tleXNfY2FuX2JlX2FkZGVkX2hl"
                            "cmUiOiJkbyBub3QgY29tcGFyZSBjbGllbnREYXRhSlNPTiBhZ2FpbnN0IGEgdGVtcGxh"
                            "dGUuIFNlZSBodHRwczovL2dvby5nbC95YWJQZXgifQ=="
                        ),
                        "signature": (
                            "MEQCIFNlrHf9ablJAalXLWkrqvHB8oIu8kwvRpH3X3rbJVpI"
                            "AiAqtOK6mIZPk62kZN0OzFsHfuvu_RlOl7zlqSNzDdz_Ag=="
                        ),
                        "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAABQ==",
                        "userHandle": None,
                    },
                },
                stage_view,
                self.user,
            )
