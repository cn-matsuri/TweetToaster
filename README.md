# 马自立自动烤肉机

## 安装方法：
需要使用Python 3  
`pip install selenium`  


## 使用方法：
进入run.py的根目录  
必须使用bash或者linux类型命令行输入`python run.py`  

出现一系列提示，可以照例子输入  
输入推文链接: https://twitter.com/natsuiromatsuri/status/1137576329002438656  
输入图片名: example.png  （注意这里最好png格式）  
输入翻译内容：这里就是写翻译内容的地方  
是否启用代理？[0/1] （这里我不会用代理，但是如果已经直接使用全局翻墙就可以直接留空白跳过）  

接下来会出现一些类似这样的日志信息

```
run.py:57: DeprecationWarning: use options instead of chrome_options
  self.driver = webdriver.Chrome(chrome_options=chrome_options)

DevTools listening on ws://127.0.0.1:64543/devtools/browser/60579239-4194-4655-ad03-ef86ca7e9789
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
127.0.0.1 - - [09/Jun/2019 01:04:26] "GET /temp.html HTTP/1.1" 200 -
127.0.0.1 - - [09/Jun/2019 01:04:26] code 404, message File not found
127.0.0.1 - - [09/Jun/2019 01:04:26] "GET /i/js_inst?c_name=ui_metrics HTTP/1.1" 404 -
127.0.0.1 - - [09/Jun/2019 01:04:26] "GET /logo.jpg HTTP/1.1" 200 -
127.0.0.1 - - [09/Jun/2019 01:04:26] code 404, message File not found
127.0.0.1 - - [09/Jun/2019 01:04:26] "GET /i/js_inst?c_name=ui_metrics HTTP/1.1" 404 -
127.0.0.1 - - [09/Jun/2019 01:04:26] code 404, message File not found
127.0.0.1 - - [09/Jun/2019 01:04:26] "GET /i/js_inst?c_name=ui_metrics HTTP/1.1" 404 -
127.0.0.1 - - [09/Jun/2019 01:04:26] code 404, message File not found
127.0.0.1 - - [09/Jun/2019 01:04:26] "GET /push_service_worker.js HTTP/1.1" 404 -
```

完成后没报错就可以去根目录下寻找你取名的图片文件了。在这里是example.png

