# 烤推机手动部署文档

> 一键脚本不可贪，手动部署保平安
>
> ——踩过坑的活性酱

- [烤推机手动部署文档](#烤推机手动部署文档)
  - [Ubuntu 18.04](#ubuntu-1804)
    - [全局依赖](#全局依赖)
      - [apt 安装以下软件包](#apt-安装以下软件包)
      - [npm 安装 pm2](#npm-安装-pm2)
        - [第一次使用 npm](#第一次使用-npm)
        - [安装 pm2](#安装-pm2)
      - [安装 ChromeDriver](#安装-chromedriver)
        - [使用 apt 安装（个人推荐）](#使用-apt-安装个人推荐)
        - [手动安装 ChromeDriver： 下载地址](#手动安装-chromedriver-下载地址)
    - [用户空间](#用户空间)
      - [拉取项目并创建配置文件](#拉取项目并创建配置文件)
        - [修改配置文件](#修改配置文件)
      - [安装 python 依赖](#安装-python-依赖)
      - [启动主程序](#启动主程序)
    - [配置 Web 服务](#配置-web-服务)
      - [Apache2](#apache2)
      - [Nginx](#nginx)
    - [部署 HTTPS](#部署-https)
  - [手动管理 Chrome 进程以节约生命 (20/08/16 更新)](#手动管理-chrome-进程以节约生命-200816-更新)
    - [将 Chrome 托管给 PM2](#将-chrome-托管给-pm2)
    - [修改后端配置](#修改后端配置)
    - [启动新的 workers](#启动新的-workers)

## Ubuntu 18.04

### 全局依赖

> 请在 root 权限下执行。（每个命令前面加个 `sudo` 就好）

#### apt 安装以下软件包

- Web 服务器 apache2 / nginx / etc.
- npm
- unzip
- git
- python3 和 python3-pip（现在 3.8 和 3.9 比较方便，所以去掉了 3.7 的限制）
- chromium-browser（这个安装时间会比较长，请耐心等待）
- fonts-noto 和 fonts-noto-color-emoji
- redis

```bash
apt install apache2 npm unzip git python3 python3-pip chromium-browser fonts-noto fonts-noto-color-emoji redis
```

如果下载速度缓慢，请自行更换源，常用源：

- [清华源](https://mirrors.tuna.tsinghua.edu.cn/help/ubuntu/)
- [北京外国语大学源](https://mirrors.bfsu.edu.cn/help/ubuntu/)
- [中科大源](http://mirrors.ustc.edu.cn/help/ubuntu.html)

#### npm 安装 pm2

##### 第一次使用 npm

如果人在国内并且不方便开代理，建议进行换源：

```bash
npm config set registry https://registry.npm.taobao.org # 换源
npm config get registry # 验证换源是否成功
```

##### 安装 pm2

在安装 pm2 之前建议先更新 npm ，避免出现 npm 过久导致安不上的情况：

```bash
npm install -g npm # 更新 npm
```

再安装 pm2

```bash
npm install -g pm2
pm2 startup # 启动 pm2
```

#### 安装 ChromeDriver

##### 使用 apt 安装（个人推荐）

```bash
apt install chromium-chromedriver
```

**为什么推荐使用 apt ？**

1. 如果选择下面的手动安装，官方下载链接中，只有 linux64 / win32 / win64 的版本；
2. 如果是 arm64 或者 armhf 架构的硬件则需要额外寻找编译好的适合自己平台的版本，并且可能会下载到不匹配的版本从而浪费时间找错误原因（血泪史）
3. apt 源中已经包含了 arm64 架构的包，并且能够自动适配当前环境中 chromium-browser 的版本

##### 手动安装 ChromeDriver： [下载地址](https://chromedriver.chromium.org/downloads)

- 通过`chromium-browser --version`查询版本，然后下载相应的二进制文件并赋权放入`/usr/local/bin`中

Ubuntu 18.04 软件源一般提供的是 version 76

```bash
wget https://chromedriver.storage.googleapis.com/76.0.3809.68/chromedriver_linux64.zip
unzip chromedriver_linux64.zip
chmod +x chromedriver
mv chromedriver /usr/local/bin
```

### 用户空间

> 请在非 root 权限的用户下执行。

#### 拉取项目并创建配置文件

```bash
git clone https://github.com/cn-matsuri/matsuri_translation
```

如果拉取卡进度，可以将 `github.com` 更改成 `github.com.cnpmjs.org`

##### 修改配置文件

```bash
cp matsuri_translation/Matsuri_translation/celeryconfig_example.py matsuri_translation/Matsuri_translation/celeryconfig.py
```

修改第 5 行的 `self_url = 'http://localhost/'` ，将其替换为你需要的链接地址（你的域名或者 ip），例如`self_url = 'https://ts.matsuri.design/'`

> 所以为什么不直接把文件放在那里而要加个\_example 呢
> 因为方便备份恢复

#### 安装 python 依赖

```bash
pip3 install pipenv
cd matsuri_translation
python3 -m pipenv run pip install -r requirements.txt
```

如果遇到下载缓慢的情况，请自行换源，常见源：

- [清华源](https://mirrors.tuna.tsinghua.edu.cn/help/pypi/)
- [北京外国语源](https://mirrors.bfsu.edu.cn/help/pypi/)
- [中科大源](http://mirrors.ustc.edu.cn/help/pypi.html)

如果执行 pip3 遇到`ImportError: cannot import name main`的错误，请在 root 下执行`hash -r`刷新一下

> 按说应该把 gunicorn 放进 requirements.txt 里吧
> 有点没搞懂原文档为什么会把额外的三个分别拉出来

#### 启动主程序

```bash
cd matsuri_translation
python3 -m pipenv run pm2 start run.sh
python3 -m pipenv run pm2 start celery_run.sh
pm2 save
```

由`pm2 status`查看各进程均为 online 即可。

如有异常，可用`pm2 logs <id>`来查看各进程的日志输出。

- 重启全部进程：pm2 restart all
- 终止全部进程：pm2 kill
- 终止某个进程：pm2 delete \<id\>

### 配置 Web 服务

例子中程序部署在**ubuntu**用户的 `~` 目录下，域名为**example.com**，请根据实际情况修改。

#### Apache2

将前端连接到网站目录

```bash
ln -s ~/matsuri_translation/Matsuri_translation/frontend /var/www
a2enmod proxy_http
service apache2 restart
```

建立虚拟主机配置文件 `sudo vim /etc/apache2/sites-available/matsuri.conf`

```apche2
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
> 总之先放个[一键脚本](./deploy.sh)里的东西在这里，不能用不怪我哦

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

### 部署 HTTPS

[https://certbot.eff.org/instructions](https://certbot.eff.org/instructions)

## 手动管理 Chrome 进程以节约生命 (20/08/16 更新)

> 测试表明，网页版获取推特截图时  
> 需要 3 到 5 秒的时间启动 Chrome 和加载推特的静态内容  
> 虽然可以通过磁盘缓存部分解决这个问题  
> 但是最好的办法还是把 Chrome 交给 PM2 管理  
> driver 通过 remote-debugging-port 连接到 Chrome，用完断开而不是退出  
> 下次使用的时候就直接重新连接而不是打开，推特的资源也会从内存缓存读取

### 将 Chrome 托管给 PM2

要注意的是这里要启动的是 Chrome 而非 ChromeDriver

首先确定你要开几个 Chrome 以及是否需要 Bot 接入

> 估计看这个文档的没人需要

编辑 chrome_pm2.json，保留你需要的东西即可  
name 改成你喜欢的也可以，我习惯把端口号写上

推特使用的 Chrome 长这样

```json
{
  "name": "chromium9223",
  "script": "chromium-browser --headless --remote-debugging-port=9223",
  "cwd": "./"
},
```

Bot 使用的 Chrome 长这样（其实差了一个 UA 不加也罢，主要 GA 的时候用来分辨 Bot 流量）

```json
{
  "name": "chromium9224",
  "script": "chromium-browser --headless --remote-debugging-port=9224 --user-agent=TweetoasterAutomaticMode",
  "cwd": "./"
},
```

然后使用 PM2 直接启动这个配置文件

```bash
pm2 start chrome_pm2.json
```

### 修改后端配置

找到 celeryconfig.py，按照下方注释修改配置

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

你也可以不用 range 直接传 list 进去，反正前面的 json 里开了哪几个端口这里就写哪几个

如果不用 auto 模式的话这里传一个 None，之后不开 auto 队列的 worker 即可。

### 启动新的 workers

编辑 celery_run_twitter.sh，将 --concurrency=2 的数值改为你需要的 worker 个数

> 到现在你应该知道这里要写啥了吧

如果需要全自动模式的话对 celery_run_auto.sh 也做同样的修改

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
