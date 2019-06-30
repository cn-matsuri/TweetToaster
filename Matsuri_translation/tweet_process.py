from datetime import datetime

from retrying import retry


class TweetProcess:
    def __init__(self, driver):
        # chrome_options = Options()
        # chrome_options.add_argument("--headless")
        # chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
        # self.driver = webdriver.Chrome(options=chrome_options)
        self.driver = driver

    def open_page(self, url):
        self.driver.get(url)

    def modify_tweet(self, text):
        self.driver.execute_script(f"$('.TweetTextSize.TweetTextSize--jumbo.js-tweet-text.tweet-text').text('{text}')")

    @retry
    def scroll_page_to_tweet(self):
        self.driver.execute_script("$('.permalink-inner.permalink-tweet-container')[0].scrollIntoView()")

    def save_screenshots(self):
        filename = datetime.now().strftime("%Y-%m-%d-%H:%M:%S")
        self.driver.save_screenshot(f'/home/fzxiao/PycharmProjects/matsuri_translation/Matsuri_translation/cache/{filename}.png')
        return filename


if __name__ == '__main__':
    t = TweetProcess()
    t.open_page('https://twitter.com/7216_2nd/status/1144776965552922624')
    t.modify_tweet('text')
    t.scroll_page_to_tweet()
    t.save_screenshots()
