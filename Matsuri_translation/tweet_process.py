from datetime import datetime
from selenium import common
from os import mkdir
from os.path import isdir
import time
import pngquant
from retrying import retry


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
        pngquant.config(min_quality=70, max_quality=95, speed=1)

    def open_page(self, url):
        self.beforeOpenPage = int(round(time.time() * 1000))
        self.driver.get(url)
        self.afterOpenPage = int(round(time.time() * 1000))

    @retry
    def scroll_page_to_tweet(self, fast):
        if fast:
            self.driver.set_window_size(640, self.driver.execute_script('''
            return $('.js-tweet-text-container').first().parents(".permalink-tweet-container,.js-stream-item").offset().top+$('.js-tweet-text-container').first().parents(".permalink-tweet-container,.js-stream-item").height();
            '''))
        else:
            self.driver.set_window_size(640, self.driver.execute_script('''
            return $('.js-tweet-text-container').last().parents(".permalink-tweet-container,.js-stream-item").offset().top+$('.js-tweet-text-container').last().parents(".permalink-tweet-container,.js-stream-item").height();
            '''))
        # self.driver.execute_script("$('body')[0].scrollIntoView()")

    def save_screenshots(self):
        filename = str(int(round(time.time() * 1000)))
        if not isdir('Matsuri_translation/frontend/cache'):
            mkdir('Matsuri_translation/frontend/cache')

        # print(self.driver.find_element_by_css_selector('iframe').get_attribute('innerHTML'))
        self.driver.save_screenshot(
            f'Matsuri_translation/frontend/cache/{filename}.png')
        # pngquant.quant_image(f'Matsuri_translation/frontend/cache/{filename}.png', f'Matsuri_translation/frontend/cache/{filename}.png')

        return self.getClipinfo(filename)

    def getClipinfo(self, filename):
        clipinfo = self.driver.execute_script('''
            var ls=[];
            $('.js-tweet-text-container').each(function(i,obj){
                var item={
                    top:$(obj).offset().top,
                    bottom:$(obj).offset().top+$(obj).height(),
                    text:$(obj).text().trim(),
                    path:$(obj).parents(".tweet").attr("data-permalink-path"),
                    blockbottom:$(obj).parents(".permalink-tweet-container,.js-stream-item").offset().top+$(obj).parents(".permalink-tweet-container,.js-stream-item").height()
                }
                ls.push(item)
            });
            $(".tco-ellipsis").remove();
            $(".Emoji--forText").each(function(i,obj){$(obj).replaceWith($(obj).attr("alt"))});
            $('.js-tweet-text-container').each(function(i,obj){
                ls[i].text=$(obj).text().trim();
            });
            return JSON.stringify(ls);
        ''')
        return filename + "|" + clipinfo

    def save_screenshots_auto(self, eventStartTime):
        filename = str(int(round(time.time() * 1000))) + "a"
        if not isdir('Matsuri_translation/frontend/cache'):
            mkdir('Matsuri_translation/frontend/cache')
        datafile = open(f'Matsuri_translation/frontend/cache/{filename}.txt', 'w',
                        encoding="utf-8")
        datafile.write(self.driver.execute_script('performanceData.afterHeadlessInstance=' + str(
            self.afterHeadlessInstance) + ';' + 'performanceData.beforeOpenPage=' + str(
            self.beforeOpenPage) + ';' + 'performanceData.afterOpenPage=' + str(
            self.afterOpenPage) + ';' + 'performanceDataOffset={};performanceData.eventStart=' + str(
            eventStartTime) + '; for(var key in performanceData)performanceDataOffset[key]=performanceData[key]-performanceData.eventStart; return JSON.stringify(performanceDataOffset);'
                                                  ))
        datafile.close()
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
        # time.sleep(0.5)
        self.driver.set_window_size(640, self.driver.execute_script('''
                    return $('.js-tweet-text-container').last().parents(".permalink-tweet-container,.js-stream-item").offset().top+$('.js-tweet-text-container').first().parents(".permalink-tweet-container,.js-stream-item").height();
                    '''))
        if "/status/" in self.driver.current_url:
            self.driver.execute_script(f'''
            //$("body").html($(".PermalinkOverlay-content").html());
            //$(".PermalinkOverlay-modal").removeClass("PermalinkOverlay-modal");
            $(".PermalinkOverlay-modal").attr("style","border-radius: 0;    min-height: 0;    margin-bottom: 0;    position: absolute;    top: 0 !important;    left: 0;    width: 640px;    margin-left: 0;");
            $(".PermalinkOverlay").css("overflow","hidden");
            $(".permalink-tweet").css("border-radius",0);
            $(".permalink").css("border",0);
            $(".permalink-container").css("width","640px");
            $('.PermalinkOverlay-modal')[0].scrollIntoView()
            ''')
        else:
            self.driver.execute_script(f'''
            //$("body").html($(".ProfileTimeline"));
            $(".ProfileTimeline").css("width","640px");
            $(".ProfileTimeline").css("position","absolute");
            $(".ProfileTimeline").css("z-index","100000");
            $(".ProfileTimeline").css("top",(0)+"px");
            $(".ProfileTimeline").css("top",(-$(".ProfileTimeline").offset().top)+"px");
            $(".ProfileTimeline").css("left",(0)+"px");
            $(".ProfileTimeline").css("left",(-$(".ProfileTimeline").offset().left)+"px");
            $(".stream-item").css("border","0");
            $(".tweet").css("padding-left","40px");
            $(".tweet").css("padding-right","40px");
            ''')
        self.driver.execute_script(f'''
            $(".js-display-this-media").click();
            $("#ancestors").css("margin","0");
            $("body").css("overflow","hidden");
            $('.follow-button').css('display','none');
            $(".tweet").css("background-color","#fff");
            $(".media-tags-container").remove();
            
            ''')
        if "/status/" in self.driver.current_url:
            self.driver.execute_script(f'''
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
            ''')


class TweetProcessV2(TweetProcess):
    def __init__(self, drive):
        super().__init__(drive)

    def scroll_page_to_tweet(self, fast):
        self.driver.set_window_size(640, self.driver.execute_script('''
            return $("[aria-label='Timeline: Conversation']").height() + $("[aria-label='Timeline: Conversation']").offset().top;
            '''))

    def modify_tweet(self):
        while True:
            try:
                self.driver.execute_script('''var jq = document.createElement("script");
                        jq.src = "https://twitter.com/jquery-3.4.1.min.js";
                        document.getElementsByTagName('head')[0].appendChild(jq);''')
                self.driver.execute_script('''
                $("header").remove();
                ''')
                break
            except common.exceptions.JavascriptException:
                time.sleep(0.1)

    def getClipinfo(self, filename):
        clipinfo = self.driver.execute_script('''
        var ls = [];
        var articleList = $('article');
        articleList.each(function(i,obj){
                var item={
                    top: $(obj).offset().top,
                    bottom: $(obj).offset().top + $(obj).height(),
                    text: $(obj).find('div[lang]').children().text(),
                    path: $(obj).find("a[title]").attr("href"),
                    blockbottom: $(obj).offset().top+$(obj).height()
                }
                ls.push(item)
            });
        return JSON.stringify(ls);
        ''')
        return filename + "|" + clipinfo
