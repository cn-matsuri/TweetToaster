from celery import Celery
from selenium import webdriver
from selenium.webdriver.chrome.webdriver import Options

from .tweet_process import TweetProcess

celery = Celery('api')
celery.config_from_object('Matsuri_translation.celeryconfig')


@celery.task()
def execute_event(event):
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    # chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
    driver = webdriver.Chrome(options=chrome_options)
    try:
        processor = TweetProcess(driver)
        processor.open_page(event['url'])

        processor.modify_tweet()
        processor.scroll_page_to_tweet(event['fast'])
        filename = processor.save_screenshots()
    finally:
        driver.close()
    return filename
