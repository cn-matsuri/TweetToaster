function submit_task() {
    var url = $('#url').val();
    var translation = $('#translation').val();
    var jqxhr = $.ajax({
        url: "//api.matsuri.design/api/tasks",
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
        var jqxhr = $.getJSON('//api.matsuri.design/api/get_task=' + task_id,
            function (data) {
                if (data.state === "SUCCESS") {
                    $("#img").append('<img src="cache/' + data.result + '.png" alt="Result" style:"">')
                    clearInterval(event);
                }
            })
    }, 3000)
}

$(function () {
    $('#submit').click(function () {
        submit_task();
    });
});