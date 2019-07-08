function submit_task() {
    var url = $('#url').val();
    var translation = $('#translation').val().replace(/\r\n|\r|\n/g, '\\r');
    var jqxhr = $.ajax({
        url: "https://api.matsuri.design/api/tasks",
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
        var jqxhr = $.getJSON('https://api.matsuri.design/api/get_task=' + task_id,
            function (data) {
                if (data.state === "SUCCESS") {
                    $("#img").append('<img class="mx-auto d-block" src="cache/' + data.result + '.png" alt="Result" style:"">')
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