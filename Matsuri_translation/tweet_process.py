from datetime import datetime
from os import mkdir
from os.path import isdir
import time
import json
from retrying import retry

from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


class TweetProcess:
    def __init__(self, driver):
        # chrome_options = Options()
        # chrome_options.add_argument("--headless")
        # chrome_options.add_argument("--proxy-server=127.0.0.1:12333")
        # self.driver = webdriver.Chrome(options=chrome_options)
        self.driver = driver
        self.afterHeadlessInstance = int(round(time.time() * 1000))
        self.beforeOpenPage = 0
        self.afterOpenPage = 0

    def open_page(self, url):
        self.beforeOpenPage = int(round(time.time() * 1000))
        self.driver.get(url)
        WebDriverWait(self.driver, 60, 0.1).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'article')))
        self.afterOpenPage = int(round(time.time() * 1000))

    @retry
    def scroll_page_to_tweet(self, fast):
        self.driver.set_window_size(640, self.driver.execute_script('''
        return document.querySelector("section").getBoundingClientRect().bottom
        '''))
        # self.driver.execute_script("$('body')[0].scrollIntoView()")

    def save_screenshots(self, fast):
        filename = str(int(round(time.time() * 1000)))
        if not isdir('Matsuri_translation/frontend/cache'):
            mkdir('Matsuri_translation/frontend/cache')

        # print(self.driver.find_element_by_css_selector('iframe').get_attribute('innerHTML'))
        self.driver.save_screenshot(
            f'Matsuri_translation/frontend/cache/{filename}.png')
        # pngquant.quant_image(f'Matsuri_translation/frontend/cache/{filename}.png', f'Matsuri_translation/frontend/cache/{filename}.png')
        #
        # var
        # item = {
        #     top:$(obj).offset().top,
        #          bottom:$(obj).offset().top +$(obj).height(),
        #                                       text:$(obj).text().trim(),
        #                                             path:$(obj).parents(".tweet").attr("data-permalink-path"),
        #                                                   blockbottom:$(obj).parents(
        #     ".permalink-tweet-container,.js-stream-item").offset().top +$(obj).parents(
        #     ".permalink-tweet-container,.js-stream-item").height()
        # }
        clipinfo = self.driver.execute_script('''
            var ls=[];
            try{
            let clipText=[...document.querySelectorAll('article>div>div>div>div>div>div>div[dir=auto][lang]'),
                ...document.querySelectorAll('article div[data-testid=tweet]>div>div>div>div[dir=auto]')]
                .sort((a,b)=>a.getBoundingClientRect().bottom-b.getBoundingClientRect().bottom);
            let clipArticle=[...document.querySelectorAll('article')];
            ls=clipArticle.map(o=>{
                let rect=o.getBoundingClientRect();
                let text=clipText.reduce((p,c)=>(c.getBoundingClientRect().bottom<rect.bottom?c:p));
                text.querySelectorAll("img").forEach(o=>{
                    try{
                        o.insertAdjacentHTML("beforeBegin",
                            '<span>'+String.fromCodePoint(parseInt(o.src.match(/\/([0-9a-f]+)\.svg/)[1],16))+'</span>'
                            );
                        o.remove();
                    }catch{}
                });
                return {
                    blockbottom:rect.bottom,
                    bottom:text.getBoundingClientRect().bottom,
                    text:[...text.querySelectorAll("span")].reduce((p,c)=>p+c.innerText,""),
                    textSize:window.getComputedStyle(text).fontSize.replace('px',''),
                }
            })
            }catch{}
            return JSON.stringify(ls);
        ''')
        return filename + "|" + clipinfo

    def save_screenshots_auto(self, eventStartTime):
        filename = str(int(round(time.time() * 1000))) + "a"
        if not isdir('Matsuri_translation/frontend/cache'):
            mkdir('Matsuri_translation/frontend/cache')
        # datafile = open(f'Matsuri_translation/frontend/cache/{filename}.txt', 'w',
        #                 encoding="utf-8")
        # datafile.write(self.driver.execute_script('performanceData.afterHeadlessInstance=' + str(
        #     self.afterHeadlessInstance) + ';' + 'performanceData.beforeOpenPage=' + str(
        #     self.beforeOpenPage) + ';' + 'performanceData.afterOpenPage=' + str(
        #     self.afterOpenPage) + ';' + 'performanceDataOffset={};performanceData.eventStart=' + str(
        #     eventStartTime) + '; for(var key in performanceData)performanceDataOffset[key]=performanceData[key]-performanceData.eventStart; return JSON.stringify(performanceDataOffset);'
        #                                           ))
        # datafile.close()
        self.driver.set_window_size(self.driver.execute_script('''
                
                    return $("canvas").first().height()==null?1920:640;
                    '''), self.driver.execute_script('''
                
                    return $("canvas").first().height()==null?2000:$("canvas").first().height();
                    '''))
        # print(self.driver.find_element_by_css_selector('iframe').get_attribute('innerHTML'))
        self.driver.save_screenshot(
            f'Matsuri_translation/frontend/cache/{filename}.png')
        # pngquant.quant_image(f'Matsuri_translation/frontend/cache/{filename}.png',f'Matsuri_translation/frontend/cache/{filename}o.png')
        return filename

    def modify_tweet(self):
        while self.driver.execute_script(
                '''
                let top=0;
                try{
                    top=document.body.parentElement.scrollTop;
                    document.body.scrollIntoView();
                }catch{}
                return top;
                '''
        ) > 0:
            # logger.info("scroll_sleep")
            time.sleep(0.5)
        self.driver.execute_script('''try{
            new_element = document.createElement("style");
            new_element.innerHTML =("*{transition:none!important}");
            document.body.appendChild(new_element);
            document.body.style.overflow="hidden";
            document.body.scrollIntoView();
            document.querySelectorAll("article div[role=button] div[dir=auto]").forEach(o=>o.click());
            document.querySelector("div[data-testid=primaryColumn]").style.maxWidth="640px";
            document.querySelector("div[data-testid=primaryColumn]").style.border="0";
            document.querySelectorAll("article div[role=group]").forEach(o=>o.remove());
            function shakeTree(node){
                for (let e of node.parentElement.children){if(e!==node)e.remove()};
                if(node.id!=="react-root")shakeTree(node.parentElement);
            }
            shakeTree(document.querySelector('section[aria-labelledby=accessible-list-0]'));
            document.querySelector("html").style.overflow="hidden";
            document.querySelectorAll("div[data-testid=caret]").forEach(o=>o.style.visibility="hidden");
            document.body.scrollIntoView();
            }catch{}''')

        self.driver.set_window_size(640, 2000)
        # time.sleep(3)
        self.driver.execute_script('''try{
                    document.body.scrollIntoView();
                    }catch{}''')

        # self.driver.set_window_size(640, self.driver.execute_script('''
        #             return $('.js-tweet-text-container').last().parents(".permalink-tweet-container,.js-stream-item").offset().top+$('.js-tweet-text-container').first().parents(".permalink-tweet-container,.js-stream-item").height();
        #             '''))
        # if "/status/" in self.driver.current_url:
        #     self.driver.execute_script(f'''
        #     //$("body").html($(".PermalinkOverlay-content").html());
        #     //$(".PermalinkOverlay-modal").removeClass("PermalinkOverlay-modal");
        #     $(".PermalinkOverlay-modal").attr("style","border-radius: 0;    min-height: 0;    margin-bottom: 0;    position: absolute;    top: 0 !important;    left: 0;    width: 640px;    margin-left: 0;");
        #     $(".PermalinkOverlay").css("overflow","hidden");
        #     $(".permalink-tweet").css("border-radius",0);
        #     $(".permalink").css("border",0);
        #     $(".permalink-container").css("width","640px");
        #     $('.PermalinkOverlay-modal')[0].scrollIntoView()
        #     ''')
        # else:
        #     self.driver.execute_script(f'''
        #     //$("body").html($(".ProfileTimeline"));
        #     $(".ProfileTimeline").css("width","640px");
        #     $(".ProfileTimeline").css("position","absolute");
        #     $(".ProfileTimeline").css("z-index","100000");
        #     $(".ProfileTimeline").css("top",(0)+"px");
        #     $(".ProfileTimeline").css("top",(-$(".ProfileTimeline").offset().top)+"px");
        #     $(".ProfileTimeline").css("left",(0)+"px");
        #     $(".ProfileTimeline").css("left",(-$(".ProfileTimeline").offset().left)+"px");
        #     $(".stream-item").css("border","0");
        #     $(".tweet").css("padding-left","40px");
        #     $(".tweet").css("padding-right","40px");
        #     ''')
        # self.driver.execute_script(f'''
        #     $(".js-display-this-media").click();
        #     $("#ancestors").css("margin","0");
        #     $("body").css("overflow","hidden");
        #     $('.follow-button').css('display','none');
        #     $(".tweet").css("background-color","#fff");
        #     $(".media-tags-container").remove();
        #
        #     ''')
        # if "/status/" in self.driver.current_url:
        #     self.driver.execute_script(f'''
        #     var timestamp = document.querySelector('.permalink-header .time > a > span').getAttribute('data-time-ms');
        #     var now = new Date(timestamp - 0);
        #     var year = now.getFullYear();
        #     var month = 1 + now.getMonth();
        #     var day = now.getDate();
        #     var hours = now.getHours() < 10 ? "0" + now.getHours() : now.getHours();
        #     var minutes = now.getMinutes() < 10 ? "0" + now.getMinutes() : now.getMinutes();
        #     var time = hours + ":" + minutes;
        #     var str = year + "年" + month + "月" + day + "日，" + time;
        #     document.querySelector('.client-and-actions .metadata > span').innerText = str;
        #     ''')
