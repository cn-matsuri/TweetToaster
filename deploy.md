# 烤推机手动部署文档

> 一键脚本不可贪，手动部署保平安
>
> ​	——踩过坑的活性酱

## Ubuntu 18.04

### 全局依赖

请在root权限下执行。

#### apt安装以下软件包：

* Web服务器 apache2 / nginx / etc.

* npm

* unzip

* git

* python3.7 和 python3-pip

* chromium-browser

* fonts-noto 和 fonts-noto-color-emoji

* redis

  ```bash
  apt install apache2 npm unzip git python3.7 python3-pip chromium-browser fonts-noto fonts-noto-color-emoji redis
  ```



#### npm安装以下软件包：

* pm2

  ```bash
  npm install pm2 -g
  pm2 startup
  ```



#### 手动安装ChromeDriver：  [ https://chromedriver.chromium.org/downloads ]

  * 通过`chromium-browser --version`查询版本，然后下载相应的二进制文件并赋权放入`/usr/local/bin`中

  * Ubuntu 18.04软件源一般提供的是version 76

    ```bash
    wget https://chromedriver.storage.googleapis.com/76.0.3809.68/chromedriver_linux64.zip
    unzip chromedriver_linux64.zip
    chmod +x chromedriver
    mv chromedriver /usr/local/bin
    ```



### 用户空间

请在非root权限的用户下执行。

#### 拉取项目并创建配置文件

```bash
git clone https://github.com/cn-matsuri/matsuri_translation
cp matsuri_translation/Matsuri_translation/celeryconfig_example.py matsuri_translation/Matsuri_translation/celeryconfig.py
```

> 所以为什么不直接把文件放在那里而要加个_example呢

#### 安装python依赖

```bash
pip3 install pipenv
cd matsuri_translation
python3 -m pipenv run pip install -r requirements.txt
python3 -m pipenv run pip install gunicorn
```

如果执行pip3遇到`ImportError: cannot import name main`的错误，请在root下执行`hash -r`刷新一下

> 按说应该把gunicorn放进requirements.txt里吧

#### 启动主程序

```bash
cd matsuri_translation
python3 -m pipenv run pm2 start run.sh
python3 -m pipenv run pm2 start celery_run.sh
pm2 save
```

由`pm2 status`查看各进程均为online即可。

如有异常，可用`pm2 logs <id>`来查看各进程的日志输出。

### 配置Web服务

例子中程序部署在**ubuntu**用户的家目录下，域名为**example.com**，请根据实际情况修改。

#### Apache2

将前端连接到网站目录

```bash
ln -s ~ubuntu/matsuri_translation/Matsuri_translation/frontend /var/www
a2enmod proxy_http
service apache2 restart
```

建立虚拟主机配置文件 `vim /etc/apache2/site-available/matsuri.conf`

```
<VirtualHost *:80>
    ServerName example.com
    DocumentRoot /var/www/frontend
    ProxyPass /api/ http://localhost:8082/api/
    ProxyPassReverse /api/ http://localhost:8082/api/
    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
```

启用配置文件

```bash
a2dissite 000-default.conf
a2ensite matsuri.conf
service apache2 reload
```

完成部署。

#### Nginx

> 活性酱不会这个，你们还是另请高明吧
>
> 总之先放个一键脚本里的东西在这里，不能用不怪我哦

```nginx
server {
    listen 80;
    server_name example.com;
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_redirect off;
        proxy_set_header Host $host:80;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location / {
        root /home/ubuntu/matsuri_translation/Matsuri_translation/frontend;
        index index.html;
    }
}
```



### 部署HTTPS

https://certbot.eff.org/instructions