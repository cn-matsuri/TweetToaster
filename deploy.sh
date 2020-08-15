#!/usr/bin/env bash

command_exists()
{
  command -v "$1" >/dev/null 2>&1
}

if [ $(command_exists git) ] && \
   [ $(command_exists python) ] && \
   [ $(command_exists pip) ]; then
    echo "Dependency Check OK";
else
    echo 'Warning: whether python or pip or git is not installed.';
    echo 'Try installing automaticly...';
    # Ask for sudo privileges
    [ "$UID" -eq 0 ] || exec sudo "$0" "$@";
    
    if [ -n "$(uname -a | grep Ubuntu)" ]; then
	sudo apt-get update && sudo apt-get install git python python-pip;
    elif [ -n "$(uname -a | grep CentOS)" ]; then
	sudo yum update && sudo yum install git python python-pip;
    else
	echo 'Error: Not a supported platform, please install dependencies by yourself!';
	exit 1;
    fi
fi

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
