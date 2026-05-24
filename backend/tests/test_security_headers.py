from app.core.config import Settings


def test_security_headers_present_on_healthz(client):
    response = client.get('/healthz')

    assert response.status_code == 200
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert response.headers['x-frame-options'] == 'DENY'
    assert response.headers['referrer-policy'] == 'no-referrer'
    assert response.headers['permissions-policy'] == 'camera=(), microphone=(), geolocation=()'


def test_allowed_hosts_settings_parses_csv_and_defaults_to_wildcard():
    assert Settings(allowed_hosts='').allowed_host_list == ['*']
    assert Settings(allowed_hosts='azvision.example.com, localhost').allowed_host_list == [
        'azvision.example.com',
        'localhost',
    ]
