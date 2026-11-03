"""Optional per-IP rate limiting via slowapi. A no-op when slowapi is absent."""
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address)
except ImportError:  # pragma: no cover
    limiter = None
    RateLimitExceeded = None
    _rate_limit_exceeded_handler = None


def rate_limit(limit_string: str):
    """Decorator applying a slowapi limit when available. Routes using it must take `request: Request`."""
    def decorator(func):
        if limiter:
            return limiter.limit(limit_string)(func)
        return func
    return decorator


def install(app) -> None:
    if limiter:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
