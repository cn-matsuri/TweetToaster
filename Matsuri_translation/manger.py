from celery import Celery, Task
from selenium import webdriver
from selenium.webdriver.chrome.webdriver import Options

from .tweet_process import TweetProcess

celery = Celery('tasks', broker='redis://localhost:6379', backend='redis://localhost:6379/0')


class BaseDriveTask(Task):
    _driver = None

    @property
    def driver(self):
        if self._driver is None:
            chrome_options = Options()
            # chrome_options.add_argument("--headless")
            chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
            self._driver = webdriver.Chrome(options=chrome_options)
        return self._driver


@celery.task(base=BaseDriveTask)
def execute_event(event):
    processor = TweetProcess(execute_event.driver)
    processor.open_page(event['url'])
    processor.modify_tweet(event['translation'])
    processor.scroll_page_to_tweet()
    filename = processor.save_screenshots()
    execute_event.driver.close()
    return filename
