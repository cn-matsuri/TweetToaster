import time

import subprocess
from utils import get
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

ELEMENT_END = "<div class="'"js-tweet-details-fixer tweet-details-fixer"'">"
TRANSLATION_START = "<div class="'"tweet-translation"'"><div class="'"translation-attribution"'"> <span> <a cass="'"attribution"'" href="'"logo.jpg"'"> "
TRANSLATION_LOGO = "<img border="'"0"'" src="'"logo.jpg"'" height="'"30"'" /> </a> </span> </div> <p class="'"tweet-translation-text"'"> <div class="'"js-tweet-text-container"'">"
TWEET_TEXT = "<p class="'"TweetTextSize  js-tweet-text tweet-text"'" lang="'" "'" data-aria-label-part="'"0"'">"


class TweetPrecess:
    def __init__(self, url: str) -> None:
        self.url = url
        self.filename = 'temp.html'

    def save_tweet(self, **kwargs):
        """
        获取推特页面并保存为html备用
        :param kwargs:
            enable_proxy: 是否启用代理
            proxy: 代理地址
        """
        try:
            with open(self.filename, 'wb') as f:
                f.write(get(self.url, **kwargs))
            return True
        except RuntimeError:
            return False

    def replace_tweet(self, translation: str) -> None:
        """
        将翻译插入html中
        :param translation: 翻译文本
        """
        new_element = f' {TRANSLATION_START} \n {TRANSLATION_LOGO} \n {TWEET_TEXT}\n {translation}</p></div></p></div> \n {ELEMENT_END} '
        _page = ''
        with open(self.filename, encoding='utf-8') as f:
            for line in f:
                if ELEMENT_END in line:
                    line = line.replace(ELEMENT_END, new_element)
                _page += line
        with open(self.filename, 'w', encoding='utf-8')as f:
            f.write(_page)


class GenerateScreenshots:
    def __init__(self, outfile: str) -> None:
        """
        :param outfile: 输出图片文件名
        """
        self.outfile = outfile
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        self.driver = webdriver.Chrome(chrome_options=chrome_options)
        self.p = subprocess.Popen('python -m http.server')
        time.sleep(2)

    def __call__(self, *args, **kwargs):
        """
        生成截图
        :param args: 无
        :param kwargs: 无
        """
        try:
            self.driver.get('http://127.0.0.1:8000/temp.html')
            self.locate_tweet()
            self.save_screenshots()
        finally:
            self.p.terminate()

    def locate_tweet(self):
        """
        缩放屏幕大小（不明白为什么要这么做
        """
        self.driver.set_window_size(1024, 600)
        time.sleep(0.2)

    def save_screenshots(self):
        """
        保存截图
        """
        self.driver.save_screenshot(f'{self.outfile}')
        self.driver.quit()


def run(url: str, img_name: str, translation: str, **kwargs) -> bool:
    """
    执行流程
    :param url: 推文链接
    :param img_name: 图片名称
    :param translation: 翻译内容
    :param kwargs:
        enable_proxy: 是否启用代理
        proxy: 代理地址
    """
    t = TweetPrecess(url)
    if t.save_tweet(**kwargs):
        t.replace_tweet(translation)
        GenerateScreenshots(img_name)()
        return True
    else:
        return False


if __name__ == '__main__':
    url = input('输入推文链接:')
    img_name = input('输入图片名:')
    translation = input('输入翻译:')
    enable_proxy = input('是否启用代理? [0/1]')
    if enable_proxy:
        proxy = input('输入http代理:')
    else:
        proxy = None
    run(url, img_name, translation, enable_proxy=enable_proxy, proxy=proxy)
