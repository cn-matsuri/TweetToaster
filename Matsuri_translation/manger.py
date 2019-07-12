from celery import Celery, Task
from selenium import webdriver
from selenium.webdriver.chrome.webdriver import Options

from tweet_process import TweetProcess

celery = Celery('api', broker='redis://localhost:6380', backend='redis://localhost:6380/0')


class BaseDriveTask(Task):
    _driver = None

    def __init__(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        # chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
        if self._driver is None:
            self.driver = webdriver.Chrome(options=chrome_options)

    def run(self, *args, **kwargs):
        pass


@celery.task(bind=True, base=BaseDriveTask)
def execute_event(self, event):
    try:
        processor = TweetProcess(self.driver)
        processor.open_page(event['url'])
        processor.modify_tweet(event['translation'])
        processor.scroll_page_to_tweet()
        filename = processor.save_screenshots()
    finally:
        # self.driver.close()
        pass
    return filename
