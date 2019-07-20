#!/usr/bin/env bash
sudo echo "$USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers
sudo apt install python python-pip git
pip install fabric
git clone https://github.com/cn-matsuri/matsuri_translation
cd matsuri_translation
python deploy.py
domain = ''
echo 'Input your domain to configured nginx, or you shall edit /etc/nginx/conf.d/1-matsuri_translation.conf'
read domain
sudo echo"server {
    listen 80;
    server_name $domain;
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_redirect off;
        proxy_set_header Host $host:80;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location / {
        root /home/$USER/matsuri_translation/Matsuri_translation/frontend;
        index index.html;
    }
}" > /etc/nginx/conf.d/1-matsuri_translation.conf
echo 'Everything has done!'
