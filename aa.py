import urllib.request
from selenium import webdriver

def getHtml(url):
 html = urllib.request.urlopen(url).read()
 return html

def saveHtml(file_name, file_content):
 # 注意windows文件命名的禁用符，比如 /
 with open(file_name.replace('/', '_') + ".html", "wb") as f:
  # 写文件用bytes而不是str，所以要转码
  f.write(file_content)

from selenium import webdriver
def take_screenshot(browser):
    browser.set_window_size(1200, 900)
    #以下代码是将浏览器页面拉到最下面。
    browser.execute_script()
    time.sleep(1)

def alter(file, old_str, new_str):
 """
 替换文件中的字符串
 :param file:文件名
 :param old_str:就字符串
 :param new_str:新字符串
 :return:
 """
 file_data = ""
 with open(file, "r", encoding="utf-8") as f:
  for line in f:
   if old_str in line:
    line = line.replace(old_str, new_str)
   file_data += line
 with open(file, "w", encoding="utf-8") as f:
  f.write(file_data)



aurl = input("推文链接：")
html = getHtml(aurl)
saveHtml("sduview", html)

print("下载成功")

translation_text=input("翻译内容:")
print(translation_text)

aa="<div class="'"js-tweet-details-fixer tweet-details-fixer"'">"
part_a="<div class="'"tweet-translation"'"><div class="'"translation-attribution"'"> <span> <a cass="'"attribution"'" href="'"https://space.bilibili.com/418124907/dynamic"'"> "
part_b="<img border="'"0"'" src="'"logo.png"'" height="'"30"'" /> </a> </span> </div> <p class="'"tweet-translation-text"'"> <div class="'"js-tweet-text-container"'">"
part_c="<p class="'"TweetTextSize  js-tweet-text tweet-text"'" lang="'" "'" data-aria-label-part="'"0"'">"
#translatio_text=translation_text+aa

str = ' %s \n %s \n %s\n %s</p></div></p></div> \n %s ' % (part_a, part_b, part_c, translation_text, aa)

alter("sduview.html", "<div class="'"js-tweet-details-fixer tweet-details-fixer"'">", str)

print("翻译替换完毕")

driver = webdriver.Ie()
driver.get("sduview.html")
take_screenshot(driver)
driver.driver.save_screenshot('name' + '.png')
driver.quit()