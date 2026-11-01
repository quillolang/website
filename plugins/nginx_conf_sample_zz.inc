server {
    listen 8080 default_server;
    return 444;
}

server {
    listen 8080;
    server_name *.shop.example;
    location / {
        root /var/www/${host}/html;
    }
}

server {
    listen 8080;
    server_name *.shop.example;
}
