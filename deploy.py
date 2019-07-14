from fabric import Connection


def install_depends_by_apt(c):
    c.local(
        'sudo apt install unzip python3.7-dev fonts-noto fonts-noto-color-emoji chromium-browser nginx redis npm git python-pip -y')


def install_driver(c):
    c.local('wget https://chromedriver.storage.googleapis.com/75.0.3770.140/chromedriver_linux64.zip')
    c.local('unzip chromedriver_linux64.zip')
    c.local('chmod +x chromedriver')
    c.local('sudo mv -f chromedriver /usr/local/share/chromedriver')
    c.local('sudo ln -s /usr/local/share/chromedriver /usr/local/bin/chromedriver')
    c.local('sudo ln -s /usr/local/share/chromedriver /usr/bin/chromedriver')


def git_pull(c):
    c.local('git clone https://github.com/cn-matsuri/matsuri_translation')


def gen_config(c):
    c.local(
        'cp matsuri_translation/Matsuri_translation/celeryconfig_example.py matsuri_translation/Matsuri_translation/celeryconfig.py')


def install_depends_by_pip(c):
    with c.lcd('matsuri_translation'):
        c.local('pip install pipenv --user')
        c.local('python -m pipenv run pip install -r requirements.txt')


def register_pm2(c):
    c.local('sudo npm install pm2 -g')
    c.local('sudo pm2 startup')
    with c.lcd('matsuri_translation'):
        c.local('python -m pipenv run pm2 start run.sh')
        c.local('python -m pipenv run pm2 start celery_run.sh')
    c.local('pm2 save')


if __name__ == '__main__':
    c = Connection(host='127.0.0.1',
                   user='0')
    install_depends_by_apt(c)
    install_driver(c)
    git_pull(c)
    gen_config(c)
    install_depends_by_pip(c)
    register_pm2(c)
