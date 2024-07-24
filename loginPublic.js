import http from 'k6/http';
import { check } from 'k6';

const baseUrl = 'https://example.com';

export function setup() {
    var params = {
        headers: { 'Content-Type': 'application/json' },
        timeout: '60s',
    };

    var payload = JSON.stringify({
        "email": "example@redikru.com",
        "password": "example123"
    });

    const loginResponse = http.post(`${baseUrl}/login/example`, payload, params);

    //console.log(`Response status: ${loginResponse.status}`);
    //console.log(`Response body: ${loginResponse.body}`);

    if (loginResponse.status !== 200) {
        console.error('Login request failed');
        console.error(`Error details: ${loginResponse.body}`);
        return null;
    }

    const accessToken = loginResponse.json().accessToken;

    const isLoggedIn = check(loginResponse, {
        'logged in successfully': (resp) => resp.status === 200 && accessToken !== ''
    });

    if (isLoggedIn) {
        console.log('Login success');
    } else {
        console.log('Login failed');
    }

    return { accessToken };
}

export default function (data) {
    if (!data || !data.accessToken) {
        console.error('No access token, skipping default function execution');
        return;
    }

    const accessToken = data.accessToken;

}