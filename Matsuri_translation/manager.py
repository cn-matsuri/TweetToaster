from celery import Celery
from selenium import webdriver
from selenium.webdriver.chrome.webdriver import Options
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from celery.exceptions import SoftTimeLimitExceeded
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)
import time
import png
from urllib import parse
import json

from celery import task
from billiard import current_process

from .tweet_process import TweetProcess
from .celeryconfig import self_url

try:
    from .celeryconfig import chrome_twitter_port
    from .celeryconfig import chrome_auto_port
except:
    chrome_twitter_port = None
    chrome_auto_port = None

# self_url=getattr(celeryconfig,'self_url',None)
# chrome_twitter_port=getattr(celeryconfig,'chrome_twitter_port',None)
# chrome_auto_port=getattr(celeryconfig,'chrome_auto_port',None)

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


@celery.task(time_limit=300, soft_time_limit=240, bind=True)
def execute_event(self, event):
    # logger.info(execute_event.name)
    # logger.info(self.request)
    # logger.info(current_process().index)
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    if (chrome_twitter_port != None):
        chrome_options.add_experimental_option("debuggerAddress",
                                               "127.0.0.1:" + str(chrome_twitter_port[current_process().index]))
    # chrome_options.add_argument("--user-data-dir=/tmp/chromium-user-dir")
    # chrome_options.add_argument("--no-sandbox")
    # WIDTH = 640  # 宽度
    # HEIGHT = 4000  # 高度
    # PIXEL_RATIO = 1.0  # 分辨率
    #
    # mobileEmulation = {"deviceMetrics": {"width": WIDTH, "height": HEIGHT, "pixelRatio": PIXEL_RATIO}}
    # chrome_options.add_experimental_option('mobileEmulation', mobileEmulation)
    # chrome_options.add_argument(
    #     "--user-agent=Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) Waterfox/56.2")
    # chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
    driver = webdriver.Chrome(options=chrome_options)
    filename = 'success|[]'

    #logger.info("tweet.execute_event.chrome_started")
    try:
        processor = TweetProcess(driver)
        processor.open_page(event['url'])
        #logger.info("tweet.execute_event.page_opened")
        processor.modify_tweet()
        # logger.info("tweet.execute_event.js_executed")
        # processor.scroll_page_to_tweet(event['fast'])
        filename = processor.save_screenshots(event['fast'])
        #logger.info("tweet.execute_event.png_get")
    except:
        # driver.save_screenshot(f'Matsuri_translation/frontend/cache/LastError.png')
        driver.quit()
        return 'LastError|[]'
    finally:
        #     # time.sleep(5)
        driver.quit()
    #
    return filename


@celery.task(time_limit=300, soft_time_limit=240, bind=True)
def execute_event_auto(self, event):
    eventStartTime = int(round(time.time() * 1000))
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--user-data-dir=/tmp/chromium-user-dir")
    chrome_options.add_argument("--user-agent=TweetoasterAutomaticMode")
    if (chrome_auto_port != None):
        chrome_options.add_experimental_option("debuggerAddress",
                                               "127.0.0.1:" + str(chrome_auto_port[current_process().index]))

    # 增加UA以触发Google Analytics
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
        driver_frontend.get(self_url + "?" + parse.urlencode(param).replace("+", "%20"))
        # time.sleep(20)
        try:
            WebDriverWait(driver_frontend, 60, 0.5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'canvas')))
        except:
            driver_frontend.save_screenshot(f'Matsuri_translation/frontend/cache/LastErrorAuto.png')
        finally:
            filename = processor.save_screenshots_auto(eventStartTime)
            try:
                event["filename"] = filename
                insert_text_chunk(f'Matsuri_translation/frontend/cache/{filename}.png',
                                  f'Matsuri_translation/frontend/cache/{filename}.png',
                                  json.dumps(event).encode("utf-8"))
            except:
                print("error in metadata")
    except:
        driver_frontend.save_screenshot(f'Matsuri_translation/frontend/cache/LastErrorAuto.png')
    finally:
        # time.sleep(5)

        driver_frontend.quit()
    return filename
