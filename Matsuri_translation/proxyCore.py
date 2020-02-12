from mitmproxy import http
import requests


def response(flow: http.HTTPFlow):
    if flow.request.pretty_url == "https://twitter.com/jquery-3.4.1.min.js":
        resp = requests.get("https://cdn.bootcss.com/jquery/3.4.1/jquery.min.js")
        flow.response.content = resp.content
        flow.response.headers['content-type'] = 'application/javascript; charset=utf-8'
