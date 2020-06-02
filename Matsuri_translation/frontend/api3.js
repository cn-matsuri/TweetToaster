//twemoji.base = "https://raw.githubusercontent.com/twitter/twemoji/master/assets/";
var url;
var saveUrlUser = false;
var isSubmittedFast;
function submit_task(isFast) {
    performanceData.beforeSubmitTask = new Date().getTime();
    isSubmittedFast = isFast;
    url = $('#url').val();
    dataLayer.push({"event": "taskSubmit", "tweetUrl": url});
    url = url.replace("mobile.twitter.com", "twitter.com");
    url = url.replace(/\?.*/, "");
    $("#url").val(url);
    //var translation = $('#translation').val().replace(/\r\n|\r|\n/g, '\\r');
    $('#progress').val("开始获取图像");
    $("#autoprogress").text("开始获取图像");
    $('#url').css("display", "none");
    $('#progress').css("display", "");
    $('#button-submit').attr("disabled", "disabled");
    $('#button-submit-fast').attr("disabled", "disabled");
    $("#translatetbody").html("");
    $("#screenshots").html("        <div id=\"screenshotclip0\" class=\"screenshotclip\"\n" +
        "             style=\"height: 800px;background-image: url('img/twittersample.jpg')\"></div>");
    var jqxhr = $.ajax({
        url: "/api/tasks",
        type: "post",
        data: JSON.stringify({
            "url": url,
            "fast": isFast || false
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
    }).done(function (data) {
        fetch_img(data.task_id)
    })
}

function fetch_img(task_id) {
    performanceData.beforeFetchImg = new Date().getTime();
    var count = 0;
    var locked = false;
    var event = setInterval(function () {
        if (locked) return;
        locked = true;
        count += 1;

        var jqxhr = $.ajax({
            url: '/api/get_task=' + task_id,
            success: function (data, status, xhr) {
                locked = false;
                if (data.state === "SUCCESS") {
                    performanceData.getTaskSucccess = new Date().getTime();
                    var filename = data.result.substr(0, data.result.indexOf("|"));
                    var clipinfo = data.result.substr(data.result.indexOf("|") + 1);
                    clipinfo = JSON.parse(clipinfo);
                    console.log(clipinfo);
                    if (isSubmittedFast && clipinfo[0] && clipinfo[0]["path"] && !url.endsWith(clipinfo[0]["path"])) {
                        submit_task(false);
                        $('#progress').val("可能为回复推文地址，正在请求完整图像");
                        $("#autoprogress").text("可能为回复推文地址，正在请求完整图像");
                        clearInterval(event);
                        return;
                    }
                    show_translate(clipinfo);
                    refresh_trans_div();


                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', 'cache/' + filename + '.png');
                    xhr.onprogress = function (event) {
                        if (event.lengthComputable) {
                            //console.log((event.loaded / event.total) * 100); // 进度
                            $('#progress').val("正在下载图片 (" + Math.round((event.loaded / event.total) * 100) + "%)");

                            $("#autoprogress").text("正在下载图片 (" + Math.round((event.loaded / event.total) * 100) + "%)");
                        }
                    };

                    xhr.onload = function (e) {
                        if (saveUrlUser) if ($("#url").val().split("/")[3] != null) localStorage.setItem("lastUser", $("#url").val().split("/")[3]);
                        saveUrlUser = false;
                        performanceData.imageLoaded = new Date().getTime();
                        $("#screenshots").html("            <div id=\"screenshotclip0\" class=\"screenshotclip\"\n" +
                            "             style=\"height: 800px;background-image: url('img/twittersample.jpg')\"></div>");
                        $("#screenshotclip0").css("background-image", 'url("cache/' + filename + '.png")');

                        $('#url').css("display", "");
                        $('#progress').css("display", "none");

                        $('#button-submit').removeAttr("disabled");
                        $('#button-submit-fast').removeAttr("disabled");
                        clip_screenshot();
                        var translateTarget = 0;
                        for (var i = 0; i < clipinfo.length; i++) if (url.endsWith(clipinfo[i]["path"])) {
                            translateTarget = i;
                            break;
                        }
                        for (var i = 1; i <= translateTarget; i++)
                            if (!$("#show" + i).is(':checked')) $("#show" + i).click();
                        if (defaultTranslate != null) {
                            var multiTranslateIndex = defaultTranslate.trim().match(/^##[0-9]+$/gm);
                            if (multiTranslateIndex != null) {
                                multiTranslateIndex = multiTranslateIndex.map(s => +s.substr(2) - 1);
                                var multiTranslation = defaultTranslate.trim().split(/\n?^##[0-9]+$\n?/gm).slice(1);
                                for (var i = 0; i < multiTranslateIndex.length; i++) {
                                    if (!$("#show" + multiTranslateIndex[i]).is(':checked')) $("#show" + i).click();
                                    $("#transtxt" + multiTranslateIndex[i]).val(multiTranslation[i]);
                                    if (multiTranslateIndex[i] != translateTarget) templatechosen[multiTranslateIndex[i]] = 1;
                                }
                            } else
                                $("#transtxt" + translateTarget).val(defaultTranslate);
                        }
                        refresh_trans_div();
                        if (defaultTranslate != null || getUrlParam("out") != null) {
                            downloadAsCanvas();
                            if (getUrlParam("out") == null) {
                                $("#autoprogress").text("正在保存");
                                setTimeout(function () {
                                    $("#autoprogress").text("结束");
                                }, 1000);

                                setTimeout(function () {
                                    window.location.href = "/";
                                }, 3000)
                            }
                        }
                    };
                    xhr.send();


                    clearInterval(event);
                }
            },
            error: function (xhr, info, e) {
                console.log(info);
                alert("服务器错误，请检查您提供的地址是否为正确的推特地址");
                $('#url').css("display", "");
                $('#progress').css("display", "none");

                $('#button-submit').removeAttr("disabled");
                $('#button-submit-fast').removeAttr("disabled");
            },
            dataType: 'json',
        });
        $('#progress').val("等待服务器响应，已尝试" + count + "次");
        $("#autoprogress").text("等待服务器响应，已尝试" + count + "次");
    }, 1000)
}

var tweetpos;
var templatechosen = [];
var defaultTranslate;

function show_translate(data) {
    console.log(data);
    tweetpos = data;
    templatechosen = [];
    $("#translatetbody").html("");
    for (var i = 0; i < tweetpos.length; i++) {
        templatechosen.push("");
        var str = tweetpos[i].text || "";
        str = str.replace(/\n/g, "<br>");
        str = str.replace(/  /g, "&nbsp; ");
        $("#translatetbody").append("<tr>\n" +
            "      <th scope=\"row\">" +
            "<input type=\'checkbox\' " + (i == 0 ? "checked" : "") + " id=\'show" + i + "\'>" +
            "</th>\n" +
            "      <td class=\'originaltext\'>" + str + "</td>\n" +
            "    <td><div class=\'translatetd\' id=\'translatetd" + i + "\' " + (i > 0 ? "style='display:none'" : "") + " ><div class=\'input-group\'>" +
            "<textarea id=\'transtxt" + i + "\' class=\'form-control\' " + (i == 0 ? "style='height:100px'" : "") + "></textarea></div>\n" +
            "      <div class=\"dropdown templatedropdown\">\n" +
            "  <button class=\"btn btn-outline-secondary w-100 dropdown-toggle\" type=\"button\" id=\"dropdownMenu" + i + "\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\n    模板选择\n  </button>\n  <div class=\"dropdown-menu dropdownmenuitems\" aria-labelledby=\"dropdownMenu" + i + "\" id=\"dropdownmenuitems" + i + "\">\n  </div>\n</div>\n      " +
            "</div></td>\n" +
            "    </tr>");

        $("#transtxt" + i).focus(function () {
            $("#screenshotclip" + $("tbody textarea").index(this))[0].scrollIntoView();
        });
        $("#transtxt" + i).keyup(function () {
            refresh_trans_div();
            $("#screenshotclip" + $("tbody textarea").index(this))[0].scrollIntoView();

        });
        $("#transtxt" + i).change(function () {
            refresh_trans_div();
            $("#screenshotclip" + $("tbody textarea").index(this))[0].scrollIntoView();

        });
        $("#show" + i).change(function () {
            refresh_trans_div();
            $("#screenshotclip" + $("tbody input").index(this))[0].scrollIntoView();

        });

    }
    $(".originaltext").click(function () {
        if (document.getSelection().type != "Range" && window.getSelection().type != "Range")
            $("#show" + $(".originaltext").index(this)).click();
    })
}

function toggleLikes(obj) {
    if ($(obj).hasClass("nolikes")) {
        $(obj).css("height", $(obj).height() + 109);
        $(obj).removeClass("nolikes");
        return true;
    } else {
        $(obj).css("height", $(obj).height() - 109);
        $(obj).addClass("nolikes");
        return false;
    }
}

function clip_screenshot() {
    $("#screenshotclip" + 0).click(function () {
        goto($(this)[0].id);
    });

    for (var i = 0; i < tweetpos.length; i++) {
        $("#screenshotclip" + i).css("height", tweetpos[i].bottom - (i == 0 ? 0 : tweetpos[i - 1].blockbottom));
        $("#screenshotclip" + i).after("<div class='screenshotclip' id='" + "screenshotclip" + (i + 1) + "'></div>");
        $("#screenshotclip" + i).after("<div class='screenshotclip' id='" + "screenshotclip" + (i + 1000) + "'></div>");
        $("#screenshotclip" + (i + 1)).css("background-image", $("#screenshotclip" + i).css("background-image"));
        $("#screenshotclip" + (i + 1000)).css("background-image", $("#screenshotclip" + i).css("background-image"));
        $("#screenshotclip" + (i + 1)).css("width", $("#screenshotclip" + i).css("width"));
        $("#screenshotclip" + (i + 1000)).css("width", $("#screenshotclip" + i).css("width"));
        $("#screenshotclip" + (i + 1)).css("height", -tweetpos[i].blockbottom);
        $("#screenshotclip" + (i + 1000)).css("height", tweetpos[i].blockbottom - tweetpos[i].bottom);
        $("#screenshotclip" + (i + 1)).css("background-position-y", -tweetpos[i].blockbottom);
        $("#screenshotclip" + (i + 1000)).css("background-position-y", -tweetpos[i].bottom);
        $("#screenshotclip" + (i + 1)).css("display", "none");
        $("#screenshotclip" + (i + 1000)).css("display", "none");
        $("#screenshotclip" + (i + 1)).click(function () {
            goto($(this)[0].id);
        });

        if (("https://twitter.com" + tweetpos[i].path) == $('#url').val()) {
            //$("#screenshotclip" + (i + 1000)).css("height", tweetpos[i].blockbottom - tweetpos[i].bottom-109);
            //$("#screenshotclip" + (i + 1000)).addClass("nolikes");
            if (localStorage.getItem("isLikeShown") != null && (!JSON.parse(localStorage.getItem("isLikeShown"))))
                toggleLikes($("#screenshotclip" + (i + 1000))[0]);
            else if (getUrlParam("noLikes") != null) toggleLikes($("#screenshotclip" + (i + 1000))[0]);
            $("#screenshotclip" + (i + 1000)).click(function () {
                localStorage.setItem("isLikeShown", JSON.stringify(toggleLikes(this)));
            });
        }
        else
            $("#screenshotclip" + (i + 1000)).click(function () {
                goto($(this)[0].id);
            });

        $("#screenshotclip" + i).after("<div class='screenshotclip' id='" + "translatediv" + i + "'></div>");

        $("#translatediv" + i).click(function () {
            goto($(this)[0].id);
        });
    }
}

var gotoDoubleClick = "";
var gotoDoubleClickTimeout = -1;
function goto(id) {
    if (gotoDoubleClick != id) {
        clearTimeout(gotoDoubleClickTimeout);
        gotoDoubleClick = id;
        gotoDoubleClickTimeout = setTimeout(() => {
            gotoDoubleClick = "";
        }, 300);
        return;
    }
    id = id.replace(/[^0-9]/g, "");
    id = parseInt(id);
    if (id >= 1000) id -= 1000;
    //console.log("goto called "+id);
    var oldurl = $('#url').val();
    $('#url').val("https://twitter.com" + tweetpos[id].path);
    if ($('#url').val() != oldurl) submit_task(); else {
        $('#url').val(oldurl.replace(/\/status\/.*/, ""));
        submit_task();
    }
}

function refresh_trans_div() {
    var template = $("#translatetemp").val();
    if (template != "") localStorage.setItem("translatetemp", template);
    var isMultiMode = true;
    var templates = [];
    var names = template.match(/<!--.*-->/g);
    var contents = template.split(/<!--.*-->/g);
    try {
        for (var i = 0; i < names.length; i++) {
            names[i] = names[i].replace("<!--", "").replace("-->", "");
        }
        for (var i = 0; i < names.length / 2; i++) {
            if (names[i * 2] == names[i * 2 + 1]) {
                templates.push({
                    name: names[i * 2], content: contents[i * 2 + 1]
                })
            } else {
                throw null;
            }
        }
    } catch (e) {
        isMultiMode = false;
        templates = [{name: "", content: template}];
    }
    //console.log(templates);
    if (isMultiMode) $('.translatetd').addClass("multi"); else $('.translatetd').removeClass("multi");
    $('.dropdownmenuitems').html("");
    for (var i = 0; i < templates.length; i++) {
        $('.dropdownmenuitems').append('<button class="dropdown-item templatebutton" type="button">' + templates[i].name + '</button>')
    }
    $('.templatebutton').click(function () {
        var i = $('.dropdownmenuitems').index($(this).parent());
        templatechosen[i] = $(this).text().trim();
        $("#translatediv" + i)[0].scrollIntoView();
        refresh_trans_div();
    });
    for (var i = 0; i < tweetpos.length; i++) {
        if ($("#show" + i).is(':checked')) {
            $("#screenshotclip" + i).show();
            $("#screenshotclip" + (i + 1000)).show();
            $("#translatediv" + i).show();
            $("#translatetd" + i).show();

        } else {
            $("#screenshotclip" + i).hide();
            $("#screenshotclip" + (i + 1000)).hide();
            $("#translatediv" + i).hide();
            $("#translatetd" + i).hide();
        }
        $("#translatediv" + i).html("");
        if ($("#transtxt" + i).val() != "") {
            var transtxt = $("#transtxt" + i).val();


            transtxt = transtxt.replace(/https?:\/\/([^ \n]+)/g, function (word) {
                console.log(word);
                return "<span class='link'>" + (
                    word.replace(/https?:\/\//g, "").length > 25 ? (word.replace(/https?:\/\//g, "").substr(0, 25) + "...") : (word.replace(/https?:\/\//g, ""))
                ) + "</span>"
            })
                .replace(/(^@[^ \n]+|\n@[^ \n]+| @[^ \n]+|^#[^ \n]*[^1234567890 \n][^ \n]*|\n#[^ \n]*[^1234567890 \n][^ \n]*| #[^ \n]*[^1234567890 \n][^ \n]*)/g, "<span class='link'>$1</span>")
                .replace(/\n/g, "<br>")
                .replace(/  /g, "&nbsp; ");
            var templateusing = template;
            if (isMultiMode) {
                templateusing = templates[0].content;

                if (typeof templatechosen[i] === 'number') templateusing = templates[templatechosen[i]].content;
                else
                    for (var j = 0; j < templates.length; j++)
                        if (templates[j].name == templatechosen[i]) templateusing = templates[j].content;
            }
            $("#translatediv" + i).html(twemoji.parse(templateusing.replace("{T}", transtxt)));
        }
    }
    // $("#screenshots img.emoji").each(function(i,obj){
    //     $(obj).replaceWith("<div class='emoji' style='background-image: url(\""+$(obj).attr("src")+"\")'></div>")
    // })


}

function getUrlParam(k) {
    var regExp = new RegExp('([?]|&)' + k + '=([^&]*)(&|$)');
    var result = window.location.href.match(regExp);
    if (result) {
        return decodeURIComponent(result[2]);
    } else {
        return null;
    }
}

$(function () {

    if (getUrlParam("template") != null && getUrlParam("template").length > 0 && getUrlParam("out") == null) {
        $.get(getUrlParam("template"), function (data, status) {
            console.log(data);
            if (confirm("将要用链接的内容替代现有的翻译模板，确认覆盖？")) localStorage.setItem("translatetemp", data);
            window.location.href = "/";
        });
    }
    $("#btnToggleTemplate").click(function () {
        if ($("#translatetemp").css("display") == "none") $("#translatetemp").show(); else $("#translatetemp").hide();
    });
    $('#button-submit').click(function () {
        saveUrlUser = true;
        submit_task();
    });
    $('#button-submit-fast').click(function () {
        saveUrlUser = true;
        submit_task(true);
    });
    if (localStorage.getItem("translatetemp") == null) localStorage.setItem("translatetemp", '<div style="margin:10px 38px">\n' +
        '<img src="img/gongfang_official.png" height="38">\n' +
        '<div style="font-size:27px;">{T}</div>\n' +
        '</div>')
    $("#translatetemp").val(localStorage.getItem("translatetemp"));
    $("#translatetemp").keyup(refresh_trans_div);
    $(".screenshotwrapper").on("touchstart", function () {
        $("body").addClass("overview");
    });
    $(".settingswrapper").on("touchstart", function () {
        $("body").removeClass("overview");
    });

    if (localStorage.getItem("lastUser") != null) $("#url").val("https://twitter.com/" + localStorage.getItem("lastUser"));
    $("#url").keypress(function (event) {
        if (event.keyCode == 13) {
            submit_task(true);
        }
    });


    if (getUrlParam("tweet") != null && getUrlParam("tweet").length > 0) {
        performanceData.autoBeforeTemplate = new Date().getTime();
        $.ajaxSettings.async = false;
        if (getUrlParam("template") != null && getUrlParam("template").length > 0) {
            $.get(getUrlParam("template"), function (data, status) {
                localStorage.setItem("translatetemp", data);
                $("#translatetemp").val(localStorage.getItem("translatetemp"));
            });
        }
        $.ajaxSettings.async = true;
        performanceData.autoAfterTemplate = new Date().getTime();
        $('#url').val(getUrlParam("tweet"));

        if (getUrlParam("translate") != null && getUrlParam("translate").length > 0) {
            defaultTranslate = getUrlParam("translate");

            defaultTranslate = defaultTranslate.replace(/\\n/g, "\n");

            $(".settingscontainer").hide();
            $(".autobanner").show();
        } else if (getUrlParam("out") != null) {
            $(".settingscontainer").hide();
            $(".autobanner").show();
        }
        if (defaultTranslate && defaultTranslate.trim().match(/^##[0-9]+$/gm) != null) submit_task(false);
        else submit_task(true);
    }


});

function downloadAsCanvas() {
    $('body')[0].scrollIntoView();
    dataLayer.push({"event": "downloadPNG", "tweetUrl": url});
    performanceData.beforeH2C = new Date().getTime();
    html2canvas(document.querySelector("#screenshots"), {useCORS: true}).then(canvas => {
        performanceData.afterH2C = new Date().getTime();
        //createAndDownloadFile("twitterImg" + new Date().getTime() + ".png", canvas.toDataURL("image/png"));
        if (getUrlParam("out") == null) {
            canvas.toBlob(function (blob) {
                saveAs(blob, "twitterImg" + new Date().getTime() + ".png");

            });
        } else {
            $("body>*").hide();
            $("body").prepend(canvas);
        }
    });
}
