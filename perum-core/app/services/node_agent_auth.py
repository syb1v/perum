import hashlib
import hmac


def derive_node_agent_token(master_token: str, hostname: str) -> str:
    if not master_token or not hostname:
        raise ValueError("agent master token and node hostname are required")
    return hmac.new(
        master_token.encode(),
        f"perum-node-agent-v1:{hostname.lower()}".encode(),
        hashlib.sha256,
    ).hexdigest()
