from app.core.config import Settings


def assert_security_headers(response):
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert response.headers['x-frame-options'] == 'DENY'
    assert response.headers['referrer-policy'] == 'no-referrer'
    assert response.headers['permissions-policy'] == 'camera=(), microphone=(), geolocation=()'


def test_security_headers_present_on_healthz(client):
    response = client.get('/healthz')

    assert response.status_code == 200
    assert_security_headers(response)


def test_allowed_hosts_settings_parses_csv_and_defaults_to_wildcard():
    assert Settings(allowed_hosts='').allowed_host_list == ['*']
    assert Settings(allowed_hosts='azvision.example.com, localhost').allowed_host_list == [
        'azvision.example.com',
        'localhost',
    ]


def test_readyz_reports_database_readiness(client):
    response = client.get('/readyz')

    assert response.status_code == 200
    assert response.json() == {
        'status': 'ok',
        'checks': {'database': True},
    }


def test_readyz_returns_503_without_internal_path_details(client, monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, 'database_ready', lambda: False)

    response = client.get('/api/v1/readyz')

    assert response.status_code == 503
    assert response.json() == {
        'status': 'degraded',
        'checks': {'database': False},
    }
    assert_security_headers(response)
    assert 'sqlite' not in response.text.lower()
    assert '/Users/' not in response.text
