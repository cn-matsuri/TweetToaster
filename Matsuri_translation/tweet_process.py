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

    def modify_tweet(self, text):
        self.driver.execute_script(
            f'''$('.follow-button').css('display','none');''')
        self.driver.execute_script(
            f'''$('.js-tweet-text-container').after('<div class="tweet-translation" data-dest-lang="zh"><div class="translation-attribution" style="font-size: 20px"><span><a class="attribution-logo" href="" rel="noopener" target="_blank" style="width: 360px; height: 31px; background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAAfCAMAAAD9a6cqAAADAFBMVEVHcEz89elLkv9kn//8qxUXXOf/rRX/rBFAiv42hf7V4vj/sBn/rAw9if//rAv/qws1hf//syL/uDRFi/f/sh03hv//rAsxgv//rQ//rQ7/rA00hP//rxUyg//p7/T/qwkzhP/o8v//tio+iv////8ugP87iP8zg/8yg//+wE3x9///rA3/qwr/rhH/syM6iP8zhP/j7v8vgf8yg/8xgv8yg/8ygv//rAu/pI//rhEyg/85h/+gxf8yff8xg///4qiRvP//rQ7/xFD/rAwpff9HkP86h///rhJuqP/RvrDw8/f/rQ/Xybv+z3ROlP95rv/W5v//rhCvz///sBrg6/vp5+azrKb+6MH/rQ7cwq4+iv+It/+91v9Ej///sh2Wv/+tknb/vDlzq//G3f/9/fxUR0A8if+bjoTFqJI/i////fz+9+ry8vH/tCL/sx9Ai/9Fj//b08zIwK3e2NFLkv9BjP/136aUsNZWmf//0nr/wUbf6/9ppP//v0H/5rT/vDr/0nrNvbT49/b/pwH/tSdenv94rf+7t7H/03r/ymP/03uWv/+lbUP/tCLJzc5spv9Kkv9bSj76+POtqqNkov99emuhkYJQT07/zWyJjIufxP+CdW1lov//wkvc1Myjx//t4dujx//Z3d/h0cX/vTpnWU7/////qwoyg///rQ4wgf80hP8ofP/9/v8lef/039AtgP//qQP/pgAgd/88if//qwc4h/9Cjf9no//45tj/rxVLk///oAD4pmj/tCFcnf/v2sjr0r9Tl//K3//gu5n/7cn+1oP5+//Grp3PtaTahFP//PVup///9+f/3ZvqxaPohFj9q27jo3PXd0vkronv0avZl3H/sRv+7t3tmlzq4NJ4X03+2pCXd13Sqoa4rIjiy7bot3zDkmm/nH6yf1X7/Kr/tXFgWVTDZzvzq3TYkV6ymoj4u3323bnumm70zZL9+s6XgWzq1YPFgFL2v4/xcFH4lWO8uav64tB9fn/iYUDppmj494/c3t75+feZZDrfh/71AAAApnRSTlMAAhIKBAIHAgIEBSffHPjvtz8VJjJI5ZR0l8iLSvcS0GD+/j3+4zCk0g391o9tH1J1/tzpq56AwP1jxfD8Bmf+/a3+hfZuW3st+SC4/v6q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) 0 0 no-repeat"></a></div><p class="tweet-translation-text"></p><div class="js-tweet-text-container"><p data-aria-label-part="0" class="TweetTextSize TweetTextSize--jumbo js-tweet-text tweet-text" lang="">{text}</div>');''')
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
