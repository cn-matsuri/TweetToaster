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
记得更改最后一行`self_url = 'http://localhost/'`成你需要的链接地址，例如`self_url = 'https://ts.matsuri.design/'`

> 所以为什么不直接把文件放在那里而要加个_example呢

#### 安装python依赖

```bash
pip3 install pipenv
cd matsuri_translation
python3 -m pipenv run pip install -r requirements.txt
python3 -m pipenv run pip install gunicorn
python3 -m pipenv run pip install pypng
python3 -m pipenv run pip install pngquant
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

建立虚拟主机配置文件 `vim /etc/apache2/sites-available/matsuri.conf`

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

## 手动管理Chrome进程以节约生命 (20/08/16更新)

>测试表明，网页版获取推特截图时   
>需要3到5秒的时间启动Chrome和加载推特的静态内容  
>虽然可以通过磁盘缓存部分解决这个问题  
>但是最好的办法还是把Chrome交给PM2管理  
>driver通过remote-debugging-port连接到Chrome，用完断开而不是退出  
>下次使用的时候就直接重新连接而不是打开，推特的资源也会从内存缓存读取  

### 将Chrome托管给PM2

要注意的是这里要启动的是Chrome而非ChromeDriver  

首先确定你要开几个Chrome以及是否需要Bot接入  

>估计看这个文档的没人需要

编辑chrome_pm2.json，保留你需要的东西即可  
name改成你喜欢的也可以，我习惯把端口号写上

推特使用的Chrome长这样
```json
{
  "name": "chromium9223",
  "script": "chromium-browser --headless --remote-debugging-port=9223",
  "cwd": "./"
},
```

Bot使用的Chrome长这样（其实差了一个UA不加也罢，主要GA的时候用来分辨Bot流量）
```json
{
  "name": "chromium9224",
  "script": "chromium-browser --headless --remote-debugging-port=9224 --user-agent=TweetoasterAutomaticMode",
  "cwd": "./"
},
```

然后使用PM2直接启动这个配置文件
```bash
pm2 start chrome_pm2.json
```

### 修改后端配置

找到celeryconfig.py，按照下方注释修改配置
```python
# 新特性加速，使用前请理解以下配置项含义

# Celery的任务路由，使用celery_run.sh时不要启用该路由配置，反正则需要启用该路由配置
task_routes = {'Matsuri_translation.manager.execute_event': 'twitter',
                'Matsuri_translation.manager.execute_event_auto': "auto"
                }

# 手动启动Chrome时负责推特的Chrome对应的调试端口号，数组长度应与celery_run_twitter.sh中配置的concurrency数量相等
# 使用了任务路由但仍然希望worker启动Chrome则传None
chrome_twitter_port=range(9222,9224)

# 手动启动Chrome时负责全自动模式的Chrome对应的调试端口号，数组长度应与celery_run_auto.sh中配置的concurrency数量相等
# 使用了任务路由但仍然希望worker启动Chrome则传None
chrome_auto_port=range(9224,9226)
```
你也可以不用range直接传list进去，反正前面的json里开了哪几个端口这里就写哪几个

如果不用auto模式的话这里传一个None，之后不开auto队列的worker即可。

### 启动新的workers

编辑celery_run_twitter.sh，将 --concurrency=2 的数值改为你需要的worker个数

>到现在你应该知道这里要写啥了吧

如果需要全自动模式的话对celery_run_auto.sh也做同样的修改

然后

```bash
pm2 restart run
pm2 start celery_run_twitter.sh
pm2 start celery_run_auto.sh
pm2 stop celery_run
```

最后测试一下你的工作成果，如果一切正常的话

```bash
pm2 delete celery_run
```

完成升级