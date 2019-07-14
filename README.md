# 马自立自动烤肉机重制版

这个烤肉机，其实是个推特嵌字机。  
出现的初衷因该是，嵌字这件事儿，大家都爱不动了。  
来回p图一样的东西，有些伤不起啊。  

于是，为了解决重复性工作，工坊招了程序员，也终于搞出来了这个项目。

// 此处补截图

烤肉机链接：https://ts.matsuri.design/


## 使用方法

打开烤肉机后，输入需要查询的推特永久链接。查询。输入翻译内容，满意后下载图片即可。  
打开任意一个模板，然后开始输入你想输入的翻译内容就行了。  
这个模板是完全可以自定义的，自己写HTML就好。  

模板打开链接的示例：https://ts.matsuri.design/?template=永久链接.txt  （这里替换永久链接.txt成一个真的文件链接）


已经完成的模板示例：  
- [夏色祭工坊模板](https://ts.matsuri.design/?template=https://raw.githubusercontent.com/cn-matsuri/toastTemplates/master/matsuri.txt)
- [诗音的魔法协模板](https://ts.matsuri.design/?template=https://raw.githubusercontent.com/cn-matsuri/toastTemplates/master/shion.txt)
- [吹雪的喵咪茶模板](https://ts.matsuri.design/?template=https://raw.githubusercontent.com/cn-matsuri/toastTemplates/master/fubuki.txt)

烤肉机模板源码地址：  
https://github.com/cn-matsuri/toastTemplates/


### 快速链接导航：  

使用规范：  
https://ts.matsuri.design/?tweet=链接地址

原推链接：  
https://twitter.com/natsuiromatsuri/status/1149735718698176513

快速链接使用例子：  
https://ts.matsuri.design/?tweet=https://twitter.com/natsuiromatsuri/status/1149735718698176513


-------------------------------------------------

不会用就是我交互没写好，不是你的锅

但是说实话我也懒得教你

以上，yuyuyzl

# 部署文档

环境要求:

- Ubuntu 18.04

部署方法：

通过ssh远程链接到服务器后输入下列命令

        wget https://raw.githubusercontent.com/cn-matsuri/matsuri_translation/master/deploy.sh && chmod +x deploy.sh && ./deploy.sh
    
提示:

- 部署过程中可能需要键入一次sudo密码
- 部署成功后会显示pm2的当前任务状况
- 你可以通过修改程序目录下的celeryconfig.py来更改redis数据库的链接地址
- 你可以重新更改你的nginx配置通过编辑/etc/nginx/conf.d/1-matsuri_translation.conf
