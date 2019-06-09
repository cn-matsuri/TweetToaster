import requests


def get(url: str, enable_proxy=False, proxy=None):
    try:
        if enable_proxy:
            proxies = {
                "http": f"http://{proxy}",
                "https": f"http://{proxy}",
            }
            r = requests.get(url, proxies=proxies)
        else:
            r = requests.get(url)
        return r.content
    except requests.RequestException:
        raise RuntimeError('Network Error')

