from datetime import datetime
from retrying import retry
from logo import *

class TweetProcess:
    def __init__(self, driver):
        # chrome_options = Options()
        # chrome_options.add_argument("--headless")
        # chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
        # self.driver = webdriver.Chrome(options=chrome_options)
        self.driver = driver

    def open_page(self, url):
        self.driver.get(url)

    def modify_tweet_origin(self, text):
        self.driver.execute_script(f"$('.TweetTextSize.TweetTextSize--jumbo.js-tweet-text.tweet-text').text('{text}')")

    @retry
    def scroll_page_to_tweet(self):
        self.driver.set_window_size(1920, 1080)
        self.driver.execute_script("$('.permalink-inner.permalink-tweet-container')[0].scrollIntoView()")

    def save_screenshots(self):
        filename = datetime.now().strftime("%Y-%m-%d-%H:%M:%S")
        self.driver.save_screenshot(
            f'/home/ubuntu/matsuri_translation/Matsuri_translation/frontend/cache/{filename}.png')
        return filename   


    ## 如果twitter链接是https://twitter.com/natsuiromatsuri 使用gongfang_official 如果是https://twitter.com/7216_2nd 使用gongfang_keke
    ## 如果推特是https://twitter.com/shirakamifubuki 使用fubuki_chapu
    ## 如果推特是https://twitter.com/murasakishionch 使用mofa_keke

    logo_base64 = gongfang_official

    def modify_tweet(self, text):
        self.driver.excute_script(
            f'''$('.follow-button').css('display','none');'''
        )
        self.driver.execute_script(
            f'''$('.js-tweet-text-container').first().after('<div class="tweet-translation" data-dest-lang="zh"><div class="translation-attribution" style="font-size: 20px"><span><a class="attribution-logo" href="" rel="noopener" target="_blank" style="width: 360px; height: 31px; background: url({logo_base64}) 0 0 no-repeat"></a></div><p class="tweet-translation-text"></p><div class="js-tweet-text-container"><p data-aria-label-part="0" class="TweetTextSize TweetTextSize--jumbo js-tweet-text tweet-text" lang="">{text}</div>');''')
        self.driver.execute_script(
            f'''
            var timestamp = document.querySelector('.permalink-header .time > a > span').getAttribute('data-time-ms');
            var now = new Date(timestamp - 0);
            var year = now.getFullYear();
            var month = 1 + now.getMonth();
            var day = now.getDate();
            var hours = now.getHours() < 10 ? "0" + now.getHours() : now.getHours();
            var minutes = now.getMinutes() < 10 ? "0" + now.getMinutes() : now.getMinutes();
            var time = hours + ":" + minutes;
            var str = year + "年" + month + "月" + day + "日，" + time;
            document.querySelector('.client-and-actions .metadata > span').innerText = str;
            '''
        )


if __name__ == '__main__':
    from selenium.webdriver.chrome.webdriver import Options
    from selenium import webdriver
    chrome_options = Options()
    # chrome_options.add_argument("--headless")
    chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
    driver = webdriver.Chrome(options=chrome_options)
    t = TweetProcess(driver)
    t.open_page('https://twitter.com/7216_2nd/status/1144776965552922624')
    t.modify_tweet('这是翻译')
    t.scroll_page_to_tweet()
    t.save_screenshots()
