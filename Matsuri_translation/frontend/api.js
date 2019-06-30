function submit_task() {
    var url = $('#url').val();
    var translation = $('#translation').val();
    var jqxhr = $.ajax({
        url: "http://127.0.0.1:5000/api/tasks",
        type: "post",
        data: JSON.stringify({
            "url": url,
            "translation": translation
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
    }).done(function (data) {
        fetch_img(data.task_id)
    })
}

function fetch_img(task_id) {
    var event = setInterval(function () {
        var jqxhr = $.getJSON('http://127.0.0.1:5000/api/get_task=' + task_id,
            function (data) {
                if (data.state === "SUCCESS") {
                    $("#img").append('<img src="cache/' + data.result + '.png" alt="Result">')
                    clearInterval(event);
                }
            })
    }, 1000)
}

$(function () {
    $('#submit').click(function () {
        submit_task();
    });
});

//我寻思post不是不能提交json吗？

//额，其实想怎么搞都可以？ post就是个简短的ajax

//你写，我学～可还行，我先本地跑起来看看ww