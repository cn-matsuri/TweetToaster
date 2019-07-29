from celery import Celery
from selenium import webdriver
from selenium.webdriver.chrome.webdriver import Options
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
import time
from .celeryconfig import self_url
from urllib import parse
from .tweet_process import TweetProcess

celery = Celery('api')
celery.config_from_object('Matsuri_translation.celeryconfig')


@celery.task(time_limit=300)
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
        # time.sleep(5)
        driver.quit()
    return filename


@celery.task(time_limit=300)
def execute_event_auto(event):
    eventStartTime = int(round(time.time() * 1000))
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    # chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
    driver_frontend = webdriver.Chrome(options=chrome_options)
    try:
        processor = TweetProcess(driver_frontend)
        param = {
            'tweet': event['tweet'],
            'template': event['template'],
            'translate': event['translate'],
            'out': 1
        }
        processor.open_page(self_url + "?" + parse.urlencode(param).replace("+", "%20"))
        # time.sleep(20)
        try:
            WebDriverWait(driver_frontend, 60, 0.5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'canvas')))
        except:
            0 == 0
        finally:
            filename = processor.save_screenshots_auto(eventStartTime)
    finally:
        # time.sleep(5)
        driver_frontend.quit()
    return filename
