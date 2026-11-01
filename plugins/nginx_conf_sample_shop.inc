server {
    listen 8443 ssl;
    server_name shop.example www.shop.example;
    ssl_certificate cert.pem;
    ssl_certificate_key key.pem;
    ssl_protocols TLSv1 TLSv1.2;
    root /srv/shop;

    # static files
    location /static {
        alias /srv/shop/static/;
    }

    location = /health {
        return 200 "ok\n";
    }

    location ^~ /images/ {
        add_header Cache-Control "max-age=3600";
    }

    location /api/ {
        proxy_pass http://app/;
        proxy_set_header Host $host;
    }

    location ~* \.(gif|jpg)$ {
        if ($request_method = POST) {
            add_header X-Odd yes;
        }
    }

    location /old {
        return 301 https://shop.example$uri;
    }
}
