from celery import Celery
from selenium import webdriver
from selenium.webdriver.chrome.webdriver import Options
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
import time
import png
from .celeryconfig import self_url
from urllib import parse
from .tweet_process import TweetProcess
import json

celery = Celery('api')
celery.config_from_object('Matsuri_translation.celeryconfig')


def insert_text_chunk(src_png, dst_png, text):
    reader = png.Reader(filename=src_png)
    chunks = reader.chunks()  # 创建一个每次返回一个chunk的生成器
    chunk_list = list(chunks)  # 把生成器的所有元素变成list
    # print(f"target png total chunks number is {len(chunk_list)}")
    chunk_item = tuple([b'tEXt', text])

    # 第一个chunk是固定的IHDR，我们把tEXt放在第2个chunk
    index = 1
    chunk_list.insert(index, chunk_item)

    with open(dst_png, 'wb') as dst_file:
        png.write_chunks(dst_file, chunk_list)


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
        insert_text_chunk(f'Matsuri_translation/frontend/cache/{filename}.png',
                          f'Matsuri_translation/frontend/cache/{filename}.png', json.dumps(event).encode("utf-8"))
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
            'out': 1
        }
        if event['translate'] != '':
            param['translate'] = event['translate']
        if 'noLikes' in event and event['noLikes']:
            param['noLikes'] = event['noLikes']
        processor.open_page(self_url + "?" + parse.urlencode(param).replace("+", "%20"))
        # time.sleep(20)
        try:
            WebDriverWait(driver_frontend, 60, 0.5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'canvas')))
        except:
            0 == 0
        finally:
            filename = processor.save_screenshots_auto(eventStartTime)
            insert_text_chunk(f'Matsuri_translation/frontend/cache/{filename}.png',
                              f'Matsuri_translation/frontend/cache/{filename}.png', json.dumps(event).encode("utf-8"))
    finally:
        # time.sleep(5)
        driver_frontend.quit()
    return filename
