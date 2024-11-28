import requests
from bs4 import BeautifulSoup
import re

API_KEY = 'olostep_beta_api_WlodlgVDr5103KtByUO0gCeeFBJrRWaYWLu2'  # Replace with your API key
baseurl = "https://psnet.ahrq.gov/webmm-case-studies?items_per_page=100&page=3"  # The URL to scrape


def sanitize_filename(filename):
    """
    Replace invalid characters in the filename with underscores.
    Invalid characters for filenames include: /, \, :, *, ?, ", <, >, |
    """
    return re.sub(r'[\/:*?"<>|]', '_', filename)

# Function to scrape case studies
def scrape_case_study(url):
    headers = {"User-Agent": "Mozilla/5.0"}

    # Send a request to get the case study page content
    response = requests.get(url, headers=headers)
    
    # Check if the request was successful
    if response.status_code != 200:
        print(f"Failed to retrieve the page: {response.status_code}")
        return None
    
    # Parse the page with BeautifulSoup
    soup = BeautifulSoup(response.text, 'html.parser')

    # Extract the title of the case study
    title_tag = soup.find('h3')
    if not title_tag:
        print("Could not find the case study title.")
        return None
    
    title = title_tag.get_text(strip=True)

    # Extract "The Case" section
    case_section_header = soup.find('h2',string=lambda text: text and ("case" in text.lower()))
    if not case_section_header:
        print("'The Case' section not found.")
        return None

    # Find all paragraphs after "The Case" header until the next heading (h2)
    case_content = []
    next_element = case_section_header.find_next_sibling()
    
    while next_element and next_element.name != 'h2':
        if next_element.name == 'p':
            case_content.append(next_element.get_text(strip=True))
        next_element = next_element.find_next_sibling()
    
    case_text = "\n\n".join(case_content)
    
    if not case_text:
        print("No content found under 'The Case'.")
        return None
    
    return {
        'title': title,
        'case_text': case_text
    }

# Function to scrape the main page and get all case study links
def scrape_all_case_studies(baseurl):
    headers = {"User-Agent": "Mozilla/5.0"}

    # Send a request to the main page
    response = requests.get(baseurl, headers=headers)
    
    if response.status_code != 200:
        print(f"Failed to retrieve the page: {response.status_code}")
        return
    
    # Parse the main page with BeautifulSoup
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Find all links within the <div class="h5">
    case_study_links = soup.find_all('div', class_='h5')

    # Open a single text file to save all case studies
    with open('case_study_3.txt', 'w', encoding='utf-8') as file:
        # Loop through each div and scrape the corresponding case study
        for div in case_study_links:
            link = div.find('a', href=True)
            if link:
                href = link['href']
                # Ensure the URL is complete by adding baseurl if necessary
                case_url = href if href.startswith('http') else f"https://psnet.ahrq.gov{href}"

                print(f"Scraping case study: {case_url}")
                case_study_data = scrape_case_study(case_url)
                
                if case_study_data:
                    # Write the case study to the single file
                    file.write(f"Title: {case_study_data['title']}\n\n")
                    file.write(f"The Case:\n{case_study_data['case_text']}\n")
                    file.write("\n" + "="*80 + "\n\n")  # Add a separator between case studies
                    print(f"Saved case study: {case_study_data['title']}")

# Start the scraping process
scrape_all_case_studies(baseurl)

