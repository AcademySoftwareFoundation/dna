"""ShotGrid / Flow Production Tracking authentication provider.

Obtains and validates user access tokens via the ShotGrid REST auth API.
Kept separate from the prodtrack ShotgridProvider.
"""

from __future__ import annotations

import base64
import json
import os
from typing import Any, Optional
from urllib.parse import quote

import requests

from dna.auth_providers.auth_provider_base import (
    AuthPrincipal,
    AuthProviderBase,
    AuthSession,
    AuthUpstreamError,
    session_expires_at,
)


class ShotgridAuthProvider(AuthProviderBase):
    """Authenticate against ShotGrid using the password / refresh_token grants."""

    provider_name = "shotgrid"

    def __init__(
        self,
        site_url: Optional[str] = None,
        http_client: Optional[Any] = None,
    ) -> None:
        raw_url = site_url or os.getenv("SHOTGRID_URL")
        if not raw_url:
            raise ValueError("SHOTGRID_URL is required for ShotGrid authentication")
        self.site_url = raw_url.rstrip("/")
        self._http = http_client or requests

    def _token_url(self) -> str:
        return f"{self.site_url}/api/v1.1/auth/access_token"

    @staticmethod
    def _error_detail(response: Any, fallback: str) -> str:
        try:
            payload = response.json()
        except ValueError:
            return fallback
        errors = payload.get("errors") if isinstance(payload, dict) else None
        if isinstance(errors, list) and errors:
            title = errors[0].get("title") if isinstance(errors[0], dict) else None
            if title:
                return str(title)
        return fallback

    def _request_token(self, data: dict[str, str]) -> dict[str, Any]:
        try:
            response = self._http.post(
                self._token_url(),
                data=data,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
                timeout=30,
            )
        except requests.RequestException as exc:
            raise AuthUpstreamError(f"ShotGrid auth unreachable: {exc}") from exc

        if response.status_code >= 500:
            raise AuthUpstreamError(
                self._error_detail(
                    response, f"ShotGrid auth failed: {response.status_code}"
                )
            )
        if response.status_code in (400, 401, 403):
            raise ValueError(
                self._error_detail(response, "Invalid ShotGrid credentials")
            )
        if response.status_code != 200:
            raise ValueError(
                self._error_detail(
                    response,
                    f"ShotGrid token request failed: {response.status_code}",
                )
            )

        payload = response.json()
        if not payload.get("access_token"):
            raise ValueError("ShotGrid token response missing access_token")
        return payload

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

    def _get_json(self, url: str, token: str) -> Any:
        try:
            response = self._http.get(
                url, headers=self._auth_headers(token), timeout=30
            )
        except requests.RequestException as exc:
            raise AuthUpstreamError(f"ShotGrid API unreachable: {exc}") from exc

        if response.status_code >= 500:
            raise AuthUpstreamError(f"ShotGrid API failed: {response.status_code}")
        if response.status_code in (401, 403):
            raise ValueError("Invalid ShotGrid access token")
        if response.status_code != 200:
            raise ValueError(f"ShotGrid API request failed: {response.status_code}")
        return response.json()

    @staticmethod
    def _record_from_jsonapi(payload: Any) -> Optional[dict[str, Any]]:
        data = payload.get("data") if isinstance(payload, dict) else None
        if isinstance(data, list):
            if not data:
                return None
            record = data[0]
        elif isinstance(data, dict):
            record = data
        else:
            return None
        attributes = record.get("attributes") or {}
        return {
            "id": record.get("id"),
            "login": attributes.get("login"),
            "email": attributes.get("email"),
            "name": attributes.get("name"),
        }

    def _user_by_login(self, token: str, login: str) -> dict[str, Any]:
        encoded = quote(login, safe="")
        url = (
            f"{self.site_url}/api/v1.1/entity/human_users"
            f"?filter[login]={encoded}&fields=id,login,email,name"
        )
        payload = self._get_json(url, token)
        record = self._record_from_jsonapi(payload)
        if not record or not record.get("email"):
            raise ValueError(f"ShotGrid user not found for login: {login}")
        return record

    def _user_by_id(self, token: str, user_id: str) -> dict[str, Any]:
        url = (
            f"{self.site_url}/api/v1.1/entity/human_users/{user_id}"
            f"?fields=id,login,email,name"
        )
        payload = self._get_json(url, token)
        record = self._record_from_jsonapi(payload)
        if not record or not record.get("email"):
            raise ValueError(f"ShotGrid user not found for id: {user_id}")
        return record

    def _current_user(self, token: str) -> dict[str, Any]:
        url = (
            f"{self.site_url}/api/v1.1/entity/human_users/me"
            f"?fields=id,login,email,name"
        )
        payload = self._get_json(url, token)
        record = self._record_from_jsonapi(payload)
        if not record or not record.get("email"):
            raise ValueError("Unable to resolve ShotGrid user for token")
        return record

    @staticmethod
    def _jwt_payload(token: str) -> Optional[dict[str, Any]]:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padding = "=" * (-len(parts[1]) % 4)
        try:
            raw = base64.urlsafe_b64decode(parts[1] + padding)
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    @classmethod
    def _user_id_from_jwt(cls, token: str) -> Optional[str]:
        jwt_claims = cls._jwt_payload(token)
        if not jwt_claims:
            return None
        nested = jwt_claims.get("payload")
        nested_user_id = nested.get("user_id") if isinstance(nested, dict) else None
        user_obj = jwt_claims.get("user")
        user_obj_id = user_obj.get("id") if isinstance(user_obj, dict) else None
        user_id = (
            jwt_claims.get("user_id")
            or jwt_claims.get("sub")
            or nested_user_id
            or user_obj_id
        )
        return str(user_id) if user_id is not None else None

    def _principal_from_user(self, user: dict[str, Any]) -> AuthPrincipal:
        email = user.get("email")
        login = user.get("login") or (email.split("@", 1)[0] if email else None)
        if not email or not login:
            raise ValueError("ShotGrid user missing email or login")
        return AuthPrincipal(
            email=email,
            login=login,
            provider=self.provider_name,
            name=user.get("name"),
            sub=str(user.get("id")) if user.get("id") is not None else None,
            claims=user,
        )

    def _session_from_token_payload(
        self, payload: dict[str, Any], principal: AuthPrincipal
    ) -> AuthSession:
        expires_in = payload.get("expires_in")
        expires_in_int = int(expires_in) if expires_in is not None else None
        return AuthSession(
            token=payload["access_token"],
            principal=principal,
            refresh_token=payload.get("refresh_token"),
            expires_in=expires_in_int,
            expires_at=session_expires_at(expires_in_int),
        )

    def authenticate(
        self,
        username: str,
        password: str,
        auth_token: Optional[str] = None,
    ) -> AuthSession:
        data = {
            "grant_type": "password",
            "username": username,
            "password": password,
        }
        if auth_token:
            data["auth_token"] = auth_token
        payload = self._request_token(data)
        access_token = payload["access_token"]
        try:
            principal = self.validate_token(access_token)
        except ValueError:
            user = self._user_by_login(access_token, username)
            principal = self._principal_from_user(user)
        return self._session_from_token_payload(payload, principal)

    def refresh(self, refresh_token: str) -> AuthSession:
        payload = self._request_token(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            }
        )
        principal = self.validate_token(payload["access_token"])
        return self._session_from_token_payload(payload, principal)

    def validate_token(self, token: str) -> AuthPrincipal:
        user_id = self._user_id_from_jwt(token)
        if user_id is not None:
            try:
                user = self._user_by_id(token, user_id)
                return self._principal_from_user(user)
            except ValueError:
                pass
        user = self._current_user(token)
        return self._principal_from_user(user)
