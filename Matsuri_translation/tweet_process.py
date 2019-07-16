from datetime import datetime
from os import mkdir
from os.path import isdir

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

    @retry
    def scroll_page_to_tweet(self):
        self.driver.set_window_size(640, 2000)
        self.driver.execute_script("$('body')[0].scrollIntoView()")

    def save_screenshots(self):
        filename = datetime.now().strftime("%Y%m%d%H%M%S")
        if not isdir('Matsuri_translation/frontend/cache'):
            mkdir('Matsuri_translation/frontend/cache')
        self.driver.save_screenshot(
            f'Matsuri_translation/frontend/cache/{filename}.png')
        datafile = open(f'Matsuri_translation/frontend/cache/{filename}.txt', 'w',
                        encoding="utf-8")
        print(self.driver.execute_script('''
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
            return JSON.stringify(ls);
        '''), file=datafile)
        return filename

    def modify_tweet(self):
        if("/status/" in self.driver.current_url):
            self.driver.execute_script(f'''
            $("body").html($(".PermalinkOverlay-content").html());
            $(".permalink-tweet").css("border-radius",0);
            $(".permalink").css("border",0);
            $(".permalink-container").css("width","640px");
            ''')
        else:
            self.driver.execute_script(f'''
            $("body").html($(".ProfileTimeline"));
            $(".ProfileTimeline").css("width","640px");
            $(".stream-item").css("border","0");
            ''')
        self.driver.execute_script(f'''
            $("#ancestors").css("margin","0");
            $("body").css("overflow","hidden");
            $('.follow-button').css('display','none');
            $(".tweet").css("background-color","#fff");
            $(".tweet").css("padding-left","40px");
            $(".tweet").css("padding-right","40px");
            $(".media-tags-container").remove();
            ''')
        if ("/status/" in self.driver.current_url):
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
