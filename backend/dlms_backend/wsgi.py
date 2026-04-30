"""
backend/dlms_backend/wsgi.py
DLMS – Riba & Company Limited

WSGI config for production (Gunicorn).
"""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "dlms_backend.settings")
application = get_wsgi_application()
