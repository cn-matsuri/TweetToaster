# 马自立自动烤肉机重制版

## 简介
这个烤肉机，其实是个推特嵌字机。  
出现的初衷因该是，嵌字这件事儿，大家都爱不动了。  
来回p图一样的东西，有些伤不起啊。  

于是，为了解决重复性工作，工坊招了程序员，也终于搞出来了这个项目。  

此项目主要感谢以下贡献者  
[FzXiao](https://github.com/fzxiao233) [b站](https://space.bilibili.com/2387011)  
[飞雪](https://github.com/wudifeixue) [b站](http://space.bilibili.com/739848)  
[鱼鱼](https://github.com/yuyuyzl) [b站](https://space.bilibili.com/1534590)  

![HowtoUse](https://raw.githubusercontent.com/cn-matsuri/matsuri_translation/master/tt_how_to_use.gif)

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

## 使用方法

### b站专栏介绍：[庆贺吧，这是集数码暴龙与嵌字man力量于一身的烤推机](https://www.bilibili.com/read/cv3081959)  
打开烤肉机后，输入需要查询的推特永久链接。查询。输入翻译内容，满意后下载图片即可。  
打开任意一个模板，然后开始输入你想输入的翻译内容就行了。  
这个模板是完全可以自定义的，自己写HTML就好。  

这里没有提供服务器连接，只是实例example.com  
模板打开链接的示例：https://www.example.com/?template=永久链接.txt  （这里替换永久链接.txt成一个真的文件链接）


烤肉机模板源码地址：  
https://github.com/cn-matsuri/toastTemplates/

## 使用感想

![茶铺使用感想](https://raw.githubusercontent.com/cn-matsuri/matsuri_translation/master/testimonial.png "茶铺使用感想")


